const mongoose = require('mongoose');
const dotenv = require('dotenv');
const User = require('./models/User');
const Application = require('./models/Application');

dotenv.config();

const companies = [
  'Google', 'Amazon', 'Microsoft', 'Netflix', 'Meta',
  'Apple', 'Spotify', 'Uber', 'Stripe', 'Airbnb',
  'Twitter', 'Salesforce', 'Adobe', 'LinkedIn', 'Oracle',
  'Cisco', 'Intel', 'IBM', 'Shopify', 'Slack'
];

const roles = [
  'Software Engineer',
  'Frontend Developer',
  'Backend Developer',
  'Full Stack Developer',
  'DevOps Engineer',
  'Data Engineer',
  'Cloud Architect',
  'Mobile App Developer'
];

const statuses = ['Applied', 'Interview', 'Offer', 'Rejected'];

const sampleNotes = [
  'Submitted application via company portal',
  'Connected with recruiter on LinkedIn',
  'First round technical phone screen scheduled',
  'Completed take-home coding assignment',
  'Onsite interview loop went well',
  'Waiting for feedback from hiring manager',
  'Discussed compensation and start date'
];

const seedData = async () => {
  try {
    console.log('Connecting to MongoDB for seeding...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB.');

    // Clear existing data
    console.log('Clearing old users and applications...');
    await Application.deleteMany({});
    await User.deleteMany({});

    // Create 2 users
    console.log('Creating 2 users...');
    const users = await User.create([
      { name: 'Alice Johnson', email: 'alice@example.com' },
      { name: 'Bob Smith', email: 'bob@example.com' }
    ]);

    const user1Id = users[0]._id;
    const user2Id = users[1]._id;

    console.log(`User 1: ${users[0].name} (${user1Id})`);
    console.log(`User 2: ${users[1].name} (${user2Id})`);

    // Generate 1,000 random applications
    console.log('Generating 1,000 applications...');
    const applications = [];

    for (let i = 0; i < 1000; i++) {
      // Alternate or randomly assign owner between user 1 and user 2
      const owner = Math.random() < 0.5 ? user1Id : user2Id;
      const company = companies[Math.floor(Math.random() * companies.length)];
      const role = roles[Math.floor(Math.random() * roles.length)];
      
      // Random status
      const status = statuses[Math.floor(Math.random() * statuses.length)];

      // Salary: Offers always have salary; other statuses may or may not
      let salary;
      if (status === 'Offer') {
        salary = Math.floor(Math.random() * 80000) + 70000; // 70k to 150k
      } else if (Math.random() < 0.4) {
        salary = Math.floor(Math.random() * 60000) + 60000;
      }

      // Add 0 to 2 random notes
      const notes = [];
      const noteCount = Math.floor(Math.random() * 3);
      for (let n = 0; n < noteCount; n++) {
        notes.push({
          text: sampleNotes[Math.floor(Math.random() * sampleNotes.length)],
          createdAt: new Date(Date.now() - Math.floor(Math.random() * 1000000000))
        });
      }

      applications.push({
        company,
        role,
        owner,
        status,
        salary,
        notes
      });
    }

    await Application.insertMany(applications);

    console.log('Successfully seeded 2 users and 1,000 applications!');
    console.log('Done!');
  } catch (error) {
    console.error('Seeding error:', error.message);
  } finally {
    await mongoose.connection.close();
    console.log('Database connection closed.');
  }
};

seedData();
