var $search;
var $searchForm;
var $results;
var $subs;

$(document).ready(function() {
	$search = $('#search');
	$searchForm = $('#searchForm');
	$results = $('#results');
	$subs = $('#subscriptions');
	$searchForm.on('submit', doSearch);

	$('body').on('click', '.addSub', addSub);
	$('body').on('click', '.sub', removeSub);
});

function doSearch(e) {
	e.preventDefault();
	var value = $search.val();
	console.log('searching for '+value);
	$.post('/searchSubreddits', {search:value}, function(res) {
		if(res.length) {
			var s = 'These subreddits matched your search:<ul>';
			res.forEach(function(sr) {
				s += '<li class=\'addSub\'>'+sr+'</li>';
			});
			s += '</ul>';
			$results.html(s);
		} else {
			$results.html('Sorry, but nothing matched your search.');
		}
	});
}

function addSub(e) {
	var sub = $(this).text();
	console.log('adding subcription to '+sub);
	$.post('/addSub', {subscription:sub}, function(res) {
		$subs.html('');
		var s = '';
		res.forEach(function(sub) {
			s += '<li><span class="sub">' + sub + '</span></li>';
		});
		$subs.html(s);
	});
}

function removeSub(e) {
	var sub = $(this).text();
	console.log('removing subcription to '+sub);
	$.post('/removeSub', {subscription:sub}, function(res) {
		$subs.html('');
		var s = '';
		res.forEach(function(sub) {
			s += '<li><span class="sub">' + sub + '</span></li>';
		});
		$subs.html(s);
	});
}