const express 		= require('express');
const dotenv 		= require('dotenv').config();
const bodyParser 	= require('body-parser');
const https			= require('https');
const request		= require('request');
const rp			= require('request-promise');
const app 			= express();
const PORT 			= 80;
const cors			= require('cors');

// Sets the parameters for accessing the database. 
const { Pool, Client } = require('pg');
const pool = new Pool({
	user:       process.env.SQL_USER,
	host:       process.env.INSTANCE_ADDR,
	database:   process.env.DB_NAME,
	password:   process.env.SQL_PASSWORD,
	port:       process.env.INSTANCE_PORT
});

app.use(cors());

app.use(
	bodyParser.urlencoded({ extended: true }),
	bodyParser.json()
);

//====================================================================
// Express.js routes

// app.get('/', (req, res) => {
// 	console.log('GET /');

// 	let newDate = new Date();
// 	console.log(newDate.toLocaleString());

// 	res.send(`GET / at ${newDate.toLocaleString()}`);
// });

// app.get('/distinct', (req, res) => {
// 	pool.query('SELECT * FROM tweets WHERE date IS NOT null LIMIT 5;', (err, results) => {
// 		if (err) {
// 			console.log(err);
// 		}
// 		else {
// 			results.rows.forEach(element => {
// 				let milliseconds = Date.parse(element.date);
// 				let dateFromMilliseconds = new Date(milliseconds);
// 				console.log(dateFromMilliseconds.toUTCString());
// 			});

// 			res.send(results.rows);
// 		}
// 	});
// });

// app.listen(PORT, () => {
// 	console.log('TwitterScraper listening on port: ' + PORT);
// });

//====================================================================
// Function definitions

const databaseQuery = () => {
	var queryPromise = new Promise((resolve, reject) => {
		let distinctTags = [];
		let distinctQuery = 'SELECT DISTINCT hashtag FROM tweets;';
		let distinctRandomQuery = 'SELECT * FROM (' +
			'SELECT DISTINCT hashtag FROM tweets' +
			') subquery ORDER by random() LIMIT 1;'

		pool.query(distinctQuery, (err, results) => {
			if (err) {
				console.log(err);
				reject(err);
			}
			else {
				console.log('Tags analyzed: ');
				results.rows.forEach(element => {
					console.log(element.hashtag);
					distinctTags.push(element.hashtag.replace('#', ''));
				});
				resolve(distinctTags);
			}
		});
	});

	queryPromise.then((message) => {
		message.forEach(element => {
			twitterAPI(element);
		});
	}).catch((message) => {
		console.log('Error resolving promise.');
	});
}

const twitterAPI = (keyword) => {
	// Set up request options for Twitter API
	let options = {
		method: 'GET',
		url: 'https://api.twitter.com/1.1/search/tweets.json',
		qs: {
			q: `%23${keyword}%20-filter%3Aretweets`,
			result_type: 'mixed',
			tweet_mode: 'extended',
			lang: 'en',
			count: 100
		},
		headers: { 
			Authorization: 'Bearer AAAAAAAAAAAAAAAAAAAAADu9AwEAAAAAjAPD6wEr6H3sB3bAaOKfmXsPeYg%3DRnXFXsZP5ZdlDXjflWp4GV93UrL0kELuPXTfgDEnhLyGOaby3O' 
		}
	};

	// Create a request to the Twitter API
	request(options, (error, response, body) => {
		if (error) {
			throw new Error(error);
		}
		else {
			let twitterResponse = JSON.parse(body);
			let tweetCount = twitterResponse.statuses.length;
			console.log(`Tweets: ${tweetCount}`);

			let twitterData = [];
			twitterData = twitterResponse.statuses;

			// Iterate over all tweets returned by API
			twitterData.forEach(element => {
				let relevantTwitterData = {
					"username": element.user.screen_name,
					"url": `https://twitter.com/${element.user.screen_name}/status/${element.id_str}`,
					"hashtag": `#${keyword}`,
					"description": element.full_text,
					"date": element.created_at
				};
				// googleNLP(relevantTwitterData);
				insertTweet(relevantTwitterData);
			});
		}
	});
}

const googleNLP = (twitterData) => {
	let requestBody = {
		"document": {
			"type": "PLAIN_TEXT",
			"language": "en",
			"content": twitterData.description
		},
		"encodingType": "UTF16"
	};

	let requestOptions = {
		method: 'POST',
		url: `https://language.googleapis.com/v1/documents:analyzeSentiment?key=${process.env.G_API_KEY}`,
		json: requestBody
	};

	request(requestOptions, (error, response, body) => {
		if (error) {
			throw new Error(error);
		}
		else {
			let tweetSentimentScore;
			try {
				tweetSentimentScore = body.documentSentiment.score	
			} 
			catch (error) {
				tweetSentimentScore = null;
				console.log('Error retrieving sentiment score for tweet: ');
				console.log(twitterData.description);
				console.log(error);
			}

			let pQuery =  
				`INSERT INTO tweets VALUES
				('${twitterData.username}',
				'${twitterData.url}',
				'${twitterData.hashtag}',
				'${tweetSentimentScore}',
				'${twitterData.description}',
				null,
				now());`;
				// '${twitterData.date}')`;

			pool.query(pQuery, (error, results) => {
				if (error) {
					console.log(error.detail);
				}
				else {
					console.log('Twitter data inserted successfully.');
				}
			});
		}
	});
}

const insertTweet = (twitterData) => {
	twitterData.description = twitterData.description.replace(/\'/g, "''");

	let pQuery =  
		`INSERT INTO tweets VALUES
		('${twitterData.username}',
		'${twitterData.url}',
		'${twitterData.hashtag}',
		null,
		'${twitterData.description}',
		null,
		now())`;

	pool.query(pQuery, (error, results) => {
		if (error) {
			if (error.detail == 'undefined' || error.detail == undefined) {
				console.log('Syntax error.');
				console.log('Tweet causing error: ' + twitterData.description);
				console.log(pQuery);
			}
			else {
				console.log(error.detail);
			}
		}
		else {
			console.log('Twitter data inserted successfully.');
		}
	});
}

const scoreTweets = () => {
	let queryPromise = new Promise((resolve, reject) => {
		let pQuery = 'SELECT * FROM tweets WHERE score IS NULL ORDER BY RANDOM() LIMIT 1000;';
		pool.query(pQuery, (error, results) => {
			if (error) {
				console.log(error);
				reject(error);
			}
			else {
				// console.log(results.rows.url);
				resolve(results.rows);
			}
		});
	});

	let succesfulInserts = 0;
	queryPromise.then(data => {
		
		data.forEach((element, index) => {
			let nlpRequest = {
				"document": {
					"type": "PLAIN_TEXT",
					"language": "en",
					"content": element.description
				},
				"encodingType": "UTF16"
			}

			let nlpOptions = {
				method: 'POST',
				url: `https://language.googleapis.com/v1/documents:analyzeSentiment?key=${process.env.G_API_KEY}`,
				json: nlpRequest
			}

			request(nlpOptions, (error, response, body) => {
				if (error) {
					throw new Error(error);
				}
				else {
					let tweetSentimentScore;
					try {
						tweetSentimentScore = body.documentSentiment.score;
					}
					catch (exception) {
						tweetSentimentScore = null;
						console.log('Error retrieving sentiment score for tweet: ');
						console.log(element.description);
						console.log(exception);
					}

					let pQuery = 
						`UPDATE tweets
						SET score = '${tweetSentimentScore}'
						WHERE url = '${element.url}'`;

					pool.query(pQuery, (pgError, results) => {
						if (pgError) {
							console.log(pgError);
						}
						else {
							// console.log('Tweet sentiment score updated successfully.');
							succesfulInserts++;
						}
					});
				}
			});

			if (index == data.length - 1) {
				console.log(`Successful inserts: ${succesfulInserts}`);
			}
		});
	}).catch(data => {
		console.log('Error resolving promise.');
		console.log(data);
	});
}

scoreTweets();
// databaseQuery();
// setInterval(() => {
// 	databaseQuery();
// }, 300000);