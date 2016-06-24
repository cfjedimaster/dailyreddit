var mongoose = require('mongoose');

var userSchema = mongoose.Schema({
	id:String,
	email:String,
	subscriptions:[String]
});

var User = mongoose.model('User', userSchema);
module.exports = User;