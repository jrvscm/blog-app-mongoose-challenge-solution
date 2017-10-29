const chai = require('chai');
const chaiHttp = require('chai-http');
const faker = require('faker');
const mongoose = require('mongoose');

const should = chai.should();

const {DATABASE_URL} = require('../config');
const {BlogPost} = require('../models');
const {app, runServer, closeServer} = require('../server');
const {TEST_DATABASE_URL} = require('../config');

//lets us use should syntax
chai.use(chaiHttp);

function seedBlogData() {
	console.info('seeding blogpost data');
	const seedData = [];

	for(let i=1; i<=10; i++) {
		seedData.push(generateBlogPostData());
	}

	//returns a promise
	return BlogPost.insertMany(seedData);
}

//used to generate data for db
function generateAuthorName() {
	const authorNames = [{firstName:"Mike", lastName: "Jones"}, {firstName: "Jack", lastName: "Sparrow"}, {firstName: "Rick", lastName: "Ross"}, {firstName: "Will", lastName:"Smith"}];
	const authorName = authorNames[Math.floor(Math.random() * authorNames.length)];
	return authorName;
}
//used to generate data for db
function generateContent() {
	const content = "Lorem ipsum dolor sit amet, consectetur adipisicing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco ";
	return content;
}

function generateTitle() {
	const titles = ["10 things you won't believe!", "9 things you won't believe", "8 things you won't believe", "7 things you won't believe",
					"6 things you won't believe!", "5 things you won't believe", "4 things you won't believe", "3 things you won't believe", 
					"2 things you won't believe!", "1 thing you wont believe"];
	return titles[Math.floor(Math.random() * titles.length)];
}


// generate an object representing a blog post.
function generateBlogPostData() {
	return {
		author: generateAuthorName(),
		title: generateTitle(),
		content: generateContent(),
		created: faker.date.past()
	}
}

//this function deletes the database and we call it in an `afterEach` block 
//to ensure data from one test does not stay in the database for the next.
function tearDownDb() {
	return new Promise((resolve, reject) => {
	console.warn('deleting database');
		mongoose.connection.dropDatabase()
		.then(result => resolve(result))
		.catch(err => reject(err))
	});
}

describe('BlogPosts API resource', function() {
	before(function() {
		return runServer(TEST_DATABASE_URL);
	});

	beforeEach(function() {
		return seedBlogData();
	});

	afterEach(function() {
		return tearDownDb(); 
	});

	after(function() {
		return closeServer();
	})

	describe(`GET endpoint`, function() {

		it('should return all existing blogposts', function() {
			//strategy:
			//1. get back all blogPosts returned by GET request to `/blogposts`
			//2. prove res has right status, datatype
			//3. prove the number of blogposts we got back is equal to the number in the db

			// need to have access to mutate and access `res` across then calls so we declarie it here.
			let res;
			return chai.request(app)
				.get('/posts')
				.then(function(_res) {
					//so subsequent blocks can access the object
					res = _res;
					res.should.have.status(200);
					res.body.should.have.length.of.at.least(1);
					return BlogPost.count();
				})
				.then(function(count) {
					res.body.should.have.length.of(count);
				});
		});

		it('should return blogposts with the right fields', function() {
			//strategy: ensure all posts have the expected keys

			let resPost
			return chai.request(app)
			.get('/posts')
			.then(function(res) {
				res.should.have.status(200);
				res.should.be.json;
				res.body.should.have.length.of.at.least(1);

				res.body.forEach(function(post) {
					post.should.be.a('object');
					post.should.include.keys(
						'id', 'title', 'author', 'content', 'created');
				});
				resPost = res.body[0];
				return BlogPost.findById(resPost.id);
			})
			.then(post => {
				resPost.title.should.equal(post.title);
				resPost.content.should.equal(post.content);
				resPost.author.should.equal(post.authorName);
			});
		});
	});

	describe('POST endpoint', function() {
		//strategy: make a POST request with data,
		//prove that the post we get back has the
		//right keys, and that the 'id' is there
		//to prove that it was inserted into db
		it('should add a new blog post', function() {

			const newPost = {
				title: faker.lorem.sentence(),
				author: {
					firstName: faker.name.firstName(),
					lastName: faker.name.lastName(),
				},
				content: faker.lorem.text()
			};

			return chai.request(app)
			.post('/posts')
			.send(newPost)
			.then(function(res) {
				res.should.have.status(201);
				res.should.be.json;
				res.body.should.include.keys(
					"id", "title", "content", "author", 'created');
				res.body.title.should.equal(newPost.title);
				res.body.id.should.not.be.null;
				res.body.author.should.equal(
					`${newPost.author.firstName} ${newPost.author.lastName}`);
				res.body.content.should.equal(newPost.content);
				return BlogPost.findById(res.body.id);
			})
			.then(function(post) {
				post.title.should.equal(newPost.title);
				post.content.should.equal(newPost.content);
				post.author.firstName.should.equal(newPost.author.firstName);
				post.author.lastName.should.equal(newPost.author.lastName);
			});
		});

	describe('PUT endpoint', function() {
		//strategy:
		//1. get an existing restaurant from db
		//2. make a PUT request to update that restaurant
		//3. prove restaurant returned by request contains data we sent
		//4. prove restaurant in db is correctly updated
		it('should update fields you send over', function() {
			const updateData = {
				title: 'fofofofofofo',
				content: 'this is some test content for the test.'
			};

			return BlogPost
			.findOne()
			.then(function(post) {
				updateData.id = post.id;
			
			return chai.request(app)
			.put(`/posts/${post.id}`)
			.send(updateData);
		})
			.then(function(res) {
				res.should.have.status(204);

				return BlogPost.findById(updateData.id);
			})
			.then(function(post) {
				post.title.should.equal(updateData.title);
				post.content.should.equal(updateData.content);
			});
		});
	});

	describe('DELETE endpoint', function() {
		//strategy:
		//1. get a blogpost
		//2. make a delete request for that posts id
		//3. assert that the response has the correct status
		//4. prove that blogpost doesnt exist in the db anymore

		it('should delete a blogpost by id', function() {
			let blogpost;

			return BlogPost.findOne()
			.then(function(_blogpost) {
				blogpost = _blogpost;
				return chai.request(app).delete(`/posts/${blogpost.id}`);
			})
			.then(function(res) {
				res.should.have.status(204);
				return BlogPost.findById(blogpost.id);
			})
			.then(function(_blogpost) {
				should.not.exist(_blogpost);
			});
		});
	});
});
});