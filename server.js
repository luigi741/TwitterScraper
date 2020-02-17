const express 		= require('express');
const dotenv 		= require('dotenv').config();
const bodyParser 	= require('body-parser');
const https			= require('https');
const request		= require('request');
const rp			= require('request-promise');
const app 			= express();
const PORT 			= 8080;
const cors			= require('cors');

//Sets the parameters for accessing the database. 
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

const getTweets = async (keyword) => {
	let formattedTag = 'artificialintelligence';
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

	request(options, (error, response, body) => {
		if (error) {
			throw new Error(error);    
		}
		else {
			let responseBody = JSON.parse(body);
			let numTweets = responseBody.statuses.length;
			let sentimentScores = [];
			let reqComplete = 0;

			try {
				console.log(`Number of tweets: ${responseBody.statuses.length}`);
				// res.send(responseBody.statuses);
			} 
			catch (error) {
				console.log('No results.');
				// res.send('Error');
			}
			
			for (let i = 0; i < numTweets; i++) {
				let googleBody = {
					"document": {
						"type": "PLAIN_TEXT",
						"language": "en",
						"content": `${responseBody.statuses[i].full_text}`
					},
					"encodingType": "UTF16"
				}
				
				let googleOptions = {
					method: 'POST',
					url: `https://language.googleapis.com/v1/documents:analyzeSentiment?key=${process.env.G_API_KEY}`,
					json: googleBody 
				}

				request(googleOptions, (error, response, googleResBody) => {
					if (error) {
						throw new Error(error);
					}
					else {
						// console.log(`${i}: ${googleResBody.documentSentiment.score}`);
						responseBody.statuses[i].sentimentScore = googleResBody.documentSentiment.score;

						// DB Schema => username | url | hashtag | score | description | searchedKeyword | date
						let pQuery = 
							`INSERT INTO tweets VALUES ('${responseBody.statuses[i].user.screen_name}', ` + 
							`'https://twitter.com/${responseBody.statuses[i].user.screen_name}/status/${responseBody.statuses[i].id_str}', ` +
							`'#${formattedTag}', ` + 
							`'${googleResBody.documentSentiment.score}', ` +
							`'${responseBody.statuses[i].full_text}', ` +
							`null, ` + 
							`'${responseBody.statuses[i].created_at}');`;

						pool.query(pQuery, (err, results) => {
							if (err) {
								console.log('Error detail: ' + err.detail);
							}
							else {
								console.log('Twitter data inserted successfully.');
							}
						});

						if (reqComplete == numTweets - 1) {
							responseBody.statuses[0].scores = sentimentScores;
						}
					}
					reqComplete++;
				});
			}
		}
	});
}

const getTech = async () => {
	let postgresQuery = 'SELECT DISTINCT hashtag FROM tweets;';
	pool.query(postgresQuery, (err, results) => {
		if (err) {
			console.log(err);
		}
		else {
			results.rows.forEach(element => {
				getTweets(element.hashtag.replace('#', ''));
			});
		}
	});
}

getTweets('machinelearning');
// getTech();
// setInterval(getTech, 30000);

app.get('/', (req, res) => {
	console.log('GET /');

	let newDate = new Date(1578418865000);
	console.log(newDate.toLocaleString());

	res.send('GET /');
});

app.get('/distinct', (req, res) => {
	pool.query('SELECT * FROM tweets WHERE date IS NOT null LIMIT 5;', (err, results) => {
		if (err) {
			console.log(err);
		}
		else {
			results.rows.forEach(element => {
				let milliseconds = Date.parse(element.date);
				let dateFromMilliseconds = new Date(milliseconds);
				console.log(dateFromMilliseconds.toUTCString());
			});

			res.send(results.rows);
		}
	});
});

app.listen(PORT, () => {
	console.log('TwitterScraper listening on port: ' + PORT);
});

//====================================================================

const pullDistinctTags = () => {

}

const databaseQuery = () => {
	var queryPromise = new Promise((resolve, reject) => {
		let distinctTags = [];
		pool.query('SELECT DISTINCT hashtag FROM tweets', (err, results) => {
			if (err) {
				console.log(err);
				reject(err);
			}
			else {
				results.rows.forEach(element => {
					distinctTags.push(element.hashtag.replace('#', ''));
				});
				resolve(distinctTags);
			}
		});
	});

	queryPromise.then((message) => {
		console.log(message);
	}).catch((message) => {
		console.log('Error resolving promise.');
	});
}

databaseQuery();
