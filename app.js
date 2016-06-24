var express = require('express');
var app = express();
var exphbs  = require('express-handlebars');
var flash = require('connect-flash');

var credentials = require('./credentials.json');

var mongoose = require('mongoose');
var opts = {
	server: {
		socketOptions: { keepAlive: 1 }
	}
};
mongoose.connect("mongodb://localhost:27017/dailyreddit", opts);

var User = require('./models/user.js');

var snoowrap = require('snoowrap');
var snoowrapper = new snoowrap({
	user_agent:'dailyreddit',
	client_id:credentials.reddit.client_id,
	client_secret:credentials.reddit.client_secret,
	refresh_token:credentials.reddit.refresh_token
});

var passport = require('passport');
var TwitterStrategy = require('passport-twitter').Strategy;

passport.use(new TwitterStrategy({
	consumerKey:credentials.twitter.consumerKey,
	consumerSecret:credentials.twitter.consumerSecret,
	callbackURL:'http://localhost:3000/auth/twitter/callback'
},function(token, tokenSecret, profile, done) {
	console.log('in done: token',token);
	//console.log('profile',profile);
	//make a user ob based on profile
	//id is provider+id
	var newUser = {
		id:profile.provider + '-' + profile.id
	}
	if(profile.emails && profile.emails.length) {
		newUser.email = profiles.emails[0].value;
	}
	console.log('newUser',newUser);
	User.update(
		{id:newUser.id},
		newUser, {upsert:true}, function(err, user) {
		if(err) return done(err);
		if(user) return done(null, newUser.id);			
	});
	/*
	User.findOne({id:newUser.id}, function(err, user) {
		console.log('did i find the user? '+user);
		if(err) return done(err);
		if(user) return done(null, user);

	});
	*/
	/*
	User.findOrCreate(newUser,function(err, user) {
		console.log('user made',user);
		if(err) return done(err);
		done(null, user);
	});
	*/
}));

passport.serializeUser(function(id, cb) {
	console.log('serializeUser '+id);
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
app.engine('handlebars', exphbs({defaultLayout: 'main'}));
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
	
	snoowrapper.search_subreddit_names({query:search}).then(function(results) {
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

function doSubscriptions() {
	console.log('doing subscriptions');
	User.find({}, function(err,users) {
		console.log('i have '+users.length+' users');
	});
}

app.get('/test', function(req, res) {
	doSubscriptions();
	res.send('ok');
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