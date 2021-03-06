var configuration = require('../config');
var gm = require('gm');
var fs = require('fs');

function route(app, db_handler, next){

	function merge(object1, object2){
		var ret = {};
		for(var key in object1){
			ret[key] = object1[key];
		}
		for(var key in object2){
			ret[key] = object2[key];
		}
		return ret;
	}

	function simple_page(view){
		return function(req, res){
			res.render(view);
		};
	}

	function simple_page_with_params(view){
		return function(req, res, params){
			res.render(view, params);
		};
	}

	function redirect_page(path){
		return function(req, res){
			res.redirect(path);
		};
	}

	function user_page(db_handler, success, failure){
		return function(req, res){
			db_handler.user.retrieve_user(req.cookies.email, req.cookies.session_token, function(err, result){
				if(err){
					failure(req, res, err);
				} else {
					success(req, res, result);
				}
			});
		};
	}

	function user_only_page(db_handler, success){
		return user_page(db_handler, success, redirect_page('/login'));
	}

	app.get('/', user_page(db_handler, simple_page_with_params('index'), simple_page_with_params('index')));
	app.get('/map', user_only_page(db_handler, simple_page_with_params('map')));
	app.get('/profile', user_only_page(db_handler, function (req, res, result){
		db_handler.user.has_avatar(result.username, function (err, avatar){
			if(err || avatar){
				res.render('profile', merge(result, avatar));
			} else {
				res.redirect('/avatar');
			}
		})
	}));

	app.get('/login', user_page(db_handler, redirect_page('/map'), simple_page('login')));
	app.post('/login', function(req, res){
		db_handler.user.verify_login(req.body.email, req.body.password, function(err, result){
			if(err){
				res.redirect('/login');
			} else{
				db_handler.user.set_user_session(req, res, req.body.email, result.session_token, 
					function (req, res){
						db_handler.user.has_avatar(result.username, function (err, has_avatar){
							if(err || has_avatar){
								res.redirect('/map');
							} else {
								res.render('avatar', merge(result, configuration.avatar));
							}
					});
				});
			}
		});
	});

	app.get('/logout', function(req, res){
		db_handler.user.delete_user_session(req, res, redirect_page('/login'));
	});

	app.get('/signup', simple_page('signup'));
	app.post('/signup', function(req, res) {
		db_handler.user.create_user(req.body.username, req.body.email, req.body.password, function(err, result){
			if(err){
				res.redirect('/signup');
			} else {
				db_handler.query('select session_token from users where username = ? or email = ?', 
						[req.body.username, req.body.email], function(err, result){
					db_handler.user.set_user_session(req, res, req.body.email, result[0].session_token, redirect_page('/avatar'));
				});
			}
		});
	});

	app.get('/avatar', user_only_page(db_handler, function (req, res, result){
				res.render('avatar', merge(result, configuration.avatar));
	}));
	app.post('/avatar', user_page(db_handler, function (req, res, result){
		db_handler.user.save_avatar(result.email, req.body.url, function(err){
			if(err){
				res.render('avatar', merge(result, configuration.avatar));
			} else {
				res.redirect('/profile');
			}
		});
	},redirect_page('/login')));
	
	app.get('/market', user_only_page(db_handler, simple_page_with_params('market')));

	app.get('/drinks', user_only_page(db_handler, simple_page_with_params('drinks')));

	app.get('/resources/games/drinks/easy', function(req, res){
		res.setHeader('Content-Type', "text/json");
		fs.readFile(app.get('dir') + "/resources/drinks.json", 'utf8', function (err, data) {
  			if(err)
  				console.log(err);
  			res.send(data);
		});
	});

	app.get('/avatars/:params(*+)', function(req, res){
		res.setHeader('Content-Type', "image/png");
		res.setHeader('Pragma', "no-cache");
		res.setHeader('Cache-Control', "no-cache, must-revalidate");
		var params = req.params.params;
		var skin_color = params.substr(0,1);
		var hair_color = params.substr(1,1);
		var shirt_color = params.substr(2,1);
		var pant_color = params.substr(3,1);
		var eye_color = params.substr(4,1);
		var hair_style = params.substr(5,1);
		var shoe_style = params.substr(6,1);
		var gender = params.substr(7,1);
		var hair_y = 10;
		var hair_color_y = 45;
		if(hair_style == 4){
			hair_y = -55;
		} else if(hair_style == 1 || hair_style == 2){
			hair_y = -25;
		}
		gm(app.get('dir') + '/assets/images/avatar/body.png')
		.draw('image Over 40,30 120,160"' + app.get('dir') + '/assets/images/avatar/face' + skin_color + '.png"')
		.draw('image Over 50,70 100,40"' + app.get('dir') + '/assets/images/avatar/eyes' + eye_color + '.png"')
		.draw('image Over 15,' + hair_y + ' 170,180 "' + app.get('dir') + '/assets/images/avatar/hairstyle' + hair_style + 'color' + hair_color + '.png"')
		.draw('image Over 62,300 78,200 "' + app.get('dir') + '/assets/images/avatar/pants' + pant_color + '.png"')
		.draw('image Over 0,190 200,200 "' + app.get('dir') + '/assets/images/avatar/' + (gender == 0 ? 'girl' : '') + 'shirt' + shirt_color + '.png"')
		.draw('image Over 57,490 85,40"' + app.get('dir') + '/assets/images/avatar/shoe'+ shoe_style + '.png"')
		.stream(function (err, stdout, stderr) {
			if(err) console.log(err);
      		stdout.pipe(res);
    	});
	});

	app.post('/api/games/:game([a-z]+)', function(req, res){
		res.setHeader('Content-Type', "text/json");
		var game_mode = req.body.mode + "_score";
		var game = req.params.game;
		var email = req.cookies.email;
		var new_score = req.body.score;
		if((game_mode === "easy_score" || game_mode === "medium_score" || game_mode === "hard_score") 
				&& new_score % 1 === 0){
			db_handler.user.quest_score(req.cookies.email, game, game_mode, function(err, results){
				if(err){
					res.send({"status" :"failure"});
				} else if(results.length == 0 || new_score > results[0].score){
					db_handler.user.save_quest_score(email, game, game_mode, new_score, function(err, result){
						if(err){
							res.send({"status" :"failure"});
						} else{
							res.send({"status" : "success", "score" : new_score});
						}
					});
				} else {
					res.send({"status" : "success", "score" : results[0].score});
				}	
			});
		} else {
			res.send({"status" :"failure"});
		}
	});

	app.use(function(req, res, next){
		res.status(404);
		if (req.accepts('html')) {
	  		db_handler.user.retrieve_user(req.cookies.email, req.cookies.session_token, function(err, result){
				if(err){
					res.render('404', err);
				} else {
					res.render('404', result);
				}
			});
	    	return;
	  	}
	  	if (req.accepts('json')) {
	    	res.send({ error: 'Not found' });
	    	return;
	  	}
	  	res.type('txt').send('Not found');
	});
}

module.exports.route = route;