var express = require('express');
var app = express();
var exphbs  = require('express-handlebars');
var flash = require('connect-flash');
var Mailgun = require('mailgun-js');
var CronJob = require('cron').CronJob;

var credentials = require('./credentials.json');

var mongoose = require('mongoose');
var opts = {
	server: {
		socketOptions: { keepAlive: 1 }
	}
};
mongoose.connect("mongodb://localhost:27017/dailyreddit", opts);

var User = require('./models/user.js');

var RedditAPI = require('./reddit');
var reddit = new RedditAPI(credentials.reddit.client_id, credentials.reddit.client_secret, credentials.reddit.refresh_token);

var passport = require('passport');
var TwitterStrategy = require('passport-twitter').Strategy;
var FacebookStrategy = require('passport-facebook').Strategy;

/*
This function is used to create/update a user based on their profile. From
what I can see, both Twitter and FB return the same 'form' so we can abstract it.
*/
function storeUser(profile,cb) {
	//make a user ob based on profile
	//id is provider+id
	var newUser = {
		id:profile.provider + '-' + profile.id
	}
	if(profile.emails && profile.emails.length) {
		newUser.email = profile.emails[0].value;
	}
	console.log('newUser',newUser);
	User.update(
		{id:newUser.id},
		newUser, {upsert:true}, function(err, user) {
		if(err) return cb(err);
		if(user) return cb(null, newUser.id);			
	});
}

passport.use(new TwitterStrategy({
	consumerKey:credentials.twitter.consumerKey,
	consumerSecret:credentials.twitter.consumerSecret,
	callbackURL:'http://localhost:3000/auth/twitter/callback'
},function(token, tokenSecret, profile, done) {
	console.log('in done: token',token);
	storeUser(profile,done);
}));

passport.use(new FacebookStrategy({
	clientID:credentials.facebook.clientID,
	clientSecret:credentials.facebook.clientSecret,
	callbackURL:'http://localhost:3000/auth/facebook/callback',
	profileFields:['id','email']
},function(token,refreshToken,profile,done) {
	console.log('in done: token',token);
	storeUser(profile,done);
}));

passport.serializeUser(function(id, cb) {
	cb(null, id);
});

passport.deserializeUser(function(id, cb) {
	console.log('deserialize being called', id);
	User.findOne({id:id}, function(err, user) {
		console.log('loaded '+user);
		cb(null,user);
	});
});

app.use(express.static('public'));
app.use(require('body-parser').urlencoded({ extended: true }));
app.use(require('express-session')({ secret: 'galaga1973', resave: false, saveUninitialized: false }));
app.use(flash());
app.engine('handlebars', exphbs({
	defaultLayout: 'main', 
	helpers:{
		left:function (str) { 
			if(str.length < 500) return str;
			return str.substr(0,500) + '...'; 
		}
	}
}));
app.set('view engine', 'handlebars');

app.use(passport.initialize());
app.use(passport.session());

app.get('/', function(req, res) {
	res.render('index',{message:req.flash('error'),title:"Login"});
});

app.get('/auth/twitter', passport.authenticate('twitter'));

app.get('/auth/twitter/callback',
  passport.authenticate('twitter', { successRedirect: '/dashboard',
                                     failureRedirect: '/' }));

app.get('/auth/facebook', passport.authenticate('facebook', {scope:['email']}));

app.get('/auth/facebook/callback',
  passport.authenticate('facebook', { successRedirect: '/dashboard',
                                     failureRedirect: '/' }));

function requireLogin(req,res,next) {
	if(!req.isAuthenticated()) return res.redirect('/');
	next();
}

app.get('/dashboard', requireLogin, function(req, res) {
	res.render('dashboard',{user:req.user,title:"Dashboard"});
});

app.post('/searchSubreddits', requireLogin, function(req, res) {
	var search = req.body.search;
	console.log('subreddit search for '+search);
	reddit.searchSubreddits(search).then(function(results) {
		res.send(results);
	});
});

app.post('/addSub', requireLogin, function(req, res) {
	var sub = req.body.subscription.toLowerCase();
	console.log('adding sub '+sub+' for the user');
	if(req.user.subscriptions.indexOf(sub) === -1) {
		req.user.subscriptions.push(sub);
	}
	req.user.save(function(err) {
		//handle errors? Suuuuure
		res.send(req.user.subscriptions);
	});
});

app.post('/removeSub', requireLogin, function(req, res) {
	var sub = req.body.subscription.toLowerCase();
	console.log('removing sub '+sub+' for the user');
	var found = req.user.subscriptions.indexOf(sub);
	if(found !== -1) {
		req.user.subscriptions.splice(found, 1);
	}
	req.user.save(function(err) {
		//handle errors? Suuuuure
		res.send(req.user.subscriptions);
	});
});

function doSubscriptions() {
	console.log('doing subscriptions');

	//get the time 24 hours ago
	var yesterday = new Date();
	yesterday.setDate(yesterday.getDate() - 1);
	//reddit uses seconds, not ms
	var yesterdayEpoch = yesterday.getTime()/1000;

	var mailgun = new Mailgun({apiKey: credentials.mailgun.apikey, domain: credentials.mailgun.domain});

	User.find({}, function(err,users) {
		console.log('i have '+users.length+' users');
		users.forEach(function(u) {
			console.log('processing '+u.id+' = '+u.subscriptions);
			var promises = [];
			if(u.subscriptions.length === 0) {
				console.log('skipping users, no subs');
				return;
			}

			u.subscriptions.forEach(function(sub) {
				promises.push(reddit.getNew(sub));
			});
			Promise.all(promises).then(function(results) {
				console.log('all done getting everything ')
				/*
				new global ob to simplify view a bit
				*/
				var subs = [];
				for(var i=0;i<results.length;i++) {
					var posts = results[i].map(function(p) {						
						if(p.thumbnail === 'self' || p.thumbnail === 'default' || p.thumbnail === 'nsfw') delete p.thumbnail;
						return p;
					});

					subs.push({
						name:u.subscriptions[i],
						posts:posts
					});
				}

				app.render('email', {subs:subs}, function(err, html) {

					var message = {	
						from: 'postmaster@raymondcamden.mailgun.org',
						to: u.email,
						subject: 'Daily Reddit Email', 
						html: html
					};	

					mailgun.messages().send(message, function (err, body) {
						//If there is an error, render the error page
						if (err) {
							console.log("got an error: ", err);
						}
						else {
							console.log(body);
						}
					});

				});

				
			}).catch(function(e) {
				console.log('EEERRRRooooRR',e);
			});
		});
	});
}


new CronJob('00 00 06 * * *', function() {
	doSubscriptions();
}, null, true, 'America/Los_Angeles');

//test force do email
app.get('/test', function(req, res) {
	doSubscriptions();
	res.send('ok');
});
//test template, a bit of code dupe here
app.get('/test2', function(req, res) {
	reddit.getNew('starwars').then(function(result) {
			var posts = result.map(function(p) {						
				if(p.thumbnail === 'self' || p.thumbnail === 'default' || p.thumbnail === 'nsfw') delete p.thumbnail;
				return p;
			});

		var subs = [{name:'StarWars',posts:posts}]
		res.render('email', {subs:subs});
	});
});

app.use(function(err, req, res, next) {
	console.log('firing error');
	console.error(err.stack);
	res.status(500).send('Oops');
});

app.set('port', process.env.PORT || 3000);

app.listen(app.get('port'), function() {
	console.log('Express running on http://localhost:' + app.get('port'));
});