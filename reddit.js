var credentials = require('./credentials.json');
var snoowrap = require('snoowrap');

var Reddit = function(client_id,client_secret,refresh_token) {
	this.config = {
		client_id:client_id,
		client_secret:client_secret,
		refresh_token:refresh_token
	};

	this.snoowrapper = new snoowrap({
		user_agent:'dailyreddit',
		client_id:client_id,
		client_secret:client_secret,
		refresh_token:refresh_token
	});

	return this;
}

Reddit.prototype.searchSubreddits = function(str) {
	console.log('called with '+str);

	return new Promise((resolve,reject) =>  {
		this.snoowrapper.search_subreddit_names({query:str}).then(function(results) {
			resolve(results);
		});
	});
	
};

module.exports = Reddit;