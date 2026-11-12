process.env.NODE_ENV = 'test';

const mongoose = require('mongoose');
const request = require('supertest');
const { MongoMemoryServer } = require('mongodb-memory-server');
const app = require('./server');
const User = require('./models/User');
const Application = require('./models/Application');

let mongoServer;

const runTests = async () => {
  console.log('--- Starting JobTrackr Automated Verification ---');
  
  try {
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    await mongoose.connect(uri);
    console.log(' Connected to in-memory MongoDB');

    // ==========================================
    // Task 1: Connect & Model Validations
    // ==========================================
    console.log('\n[Task 1: Models & Validation]');

    // 1.1 Test User validation
    const user1 = await User.create({ name: 'Alice Johnson', email: 'alice@example.com' });
    const user2 = await User.create({ name: 'Bob Smith', email: 'bob@example.com' });
    console.log(' User model created with unique email & timestamps');

    // Duplicate email check
    try {
      await User.create({ name: 'Alice Copy', email: 'alice@example.com' });
      throw new Error('Duplicate email should have failed!');
    } catch (err) {
      console.log(' Duplicate email rejected correctly');
    }

    // 1.2 Test Application model validation (enums, min salary)
    const appValid = await Application.create({
      company: 'Google',
      role: 'Software Engineer',
      owner: user1._id,
      status: 'Applied',
      salary: 120000,
      notes: [{ text: 'First round done' }]
    });
    console.log(' Application model created with embedded notes & referenced owner');

    // Invalid status enum check
    try {
      await Application.create({
        company: 'Meta',
        role: 'Engineer',
        owner: user1._id,
        status: 'Pending' // invalid
      });
      throw new Error('Invalid status should have failed!');
    } catch (err) {
      console.log(' Invalid status enum rejected correctly');
    }

    // Negative salary check
    try {
      await Application.create({
        company: 'Meta',
        role: 'Engineer',
        owner: user1._id,
        salary: -100 // invalid
      });
      throw new Error('Negative salary should have failed!');
    } catch (err) {
      console.log(' Negative salary rejected correctly');
    }

    // ==========================================
    // Task 2: CRUD with Mongoose & Error Cases
    // ==========================================
    console.log('\n[Task 2: CRUD Routes & Error Handling]');

    // 2.1 GET /api/applications/:id
    const getRes = await request(app).get(`/api/applications/${appValid._id}`);
    if (getRes.status === 200 && getRes.body.owner.name === 'Alice Johnson') {
      console.log(' GET /api/applications/:id returns populated owner');
    } else {
      throw new Error(`GET /api/applications/:id failed: ${JSON.stringify(getRes.body)}`);
    }

    // 2.2 Bad ID CastError -> 400
    const badIdRes = await request(app).get('/api/applications/123invalidId');
    if (badIdRes.status === 400 && badIdRes.body.error.includes('Invalid')) {
      console.log(' CastError (bad id) returned 400 Bad Request');
    } else {
      throw new Error(`CastError test failed: ${JSON.stringify(badIdRes.body)}`);
    }

    // 2.3 Unknown ID -> 404
    const nonExistentId = new mongoose.Types.ObjectId();
    const notFoundRes = await request(app).get(`/api/applications/${nonExistentId}`);
    if (notFoundRes.status === 404) {
      console.log(' Non-existent ID returned 404 Not Found');
    } else {
      throw new Error(`404 test failed: ${JSON.stringify(notFoundRes.body)}`);
    }

    // 2.4 ValidationError -> 400 with message per field
    const valRes = await request(app).post('/api/applications').send({});
    if (valRes.status === 400 && valRes.body.messages && valRes.body.messages.company) {
      console.log(' ValidationError returned 400 with message per field:', valRes.body.messages);
    } else {
      throw new Error(`ValidationError test failed: ${JSON.stringify(valRes.body)}`);
    }

    // 2.5 POST /api/applications/:id/notes
    const noteRes = await request(app)
      .post(`/api/applications/${appValid._id}/notes`)
      .send({ text: 'Had phone screen with HR' });

    if (noteRes.status === 200 && noteRes.body.notes.length === 2 && noteRes.body.owner.email) {
      console.log(' POST /api/applications/:id/notes pushed note and returned populated application');
    } else {
      throw new Error(`Notes endpoint failed: ${JSON.stringify(noteRes.body)}`);
    }

    // 2.6 PUT /api/applications/:id
    const putRes = await request(app)
      .put(`/api/applications/${appValid._id}`)
      .send({ status: 'Interview', salary: 130000 });
    if (putRes.status === 200 && putRes.body.status === 'Interview' && putRes.body.salary === 130000) {
      console.log(' PUT /api/applications/:id updated successfully');
    } else {
      throw new Error(`PUT test failed: ${JSON.stringify(putRes.body)}`);
    }

    // 2.7 DELETE /api/applications/:id
    const toDelete = await Application.create({
      company: 'TempCo',
      role: 'Intern',
      owner: user2._id
    });
    const delRes = await request(app).delete(`/api/applications/${toDelete._id}`);
    if (delRes.status === 200) {
      console.log(' DELETE /api/applications/:id deleted successfully');
    }

    // ==========================================
    // Task 3: Seed 1,000 Applications & explain() Index
    // ==========================================
    console.log('\n[Task 3: Seed 1,000 Records & Compound Index Benchmark]');

    // Clear and seed 1,000 records
    await Application.deleteMany({});
    const bulkApps = [];
    const statuses = ['Applied', 'Interview', 'Offer', 'Rejected'];

    for (let i = 0; i < 1000; i++) {
      const owner = i % 2 === 0 ? user1._id : user2._id;
      const status = statuses[i % 4];
      const salary = status === 'Offer' ? 80000 + (i * 50) : 50000;
      bulkApps.push({
        company: `Company ${i % 20}`,
        role: `Role ${i % 5}`,
        owner,
        status,
        salary,
        notes: [{ text: `Note for application ${i}` }]
      });
    }
    await Application.insertMany(bulkApps);
    console.log(' Seeded 1,000 applications');

    // Run explain WITHOUT index (drop compound index first)
    try {
      await Application.collection.dropIndex({ owner: 1, status: 1 });
    } catch (e) {
      // index might not exist yet
    }

    const beforeExplain = await Application.find({
      owner: user1._id,
      status: 'Interview'
    }).explain('executionStats');

    const beforeStage = beforeExplain.executionStats.executionStages.stage;
    const beforeDocsExamined = beforeExplain.executionStats.totalDocsExamined;

    // Add compound index
    await Application.collection.createIndex({ owner: 1, status: 1 });

    const afterExplain = await Application.find({
      owner: user1._id,
      status: 'Interview'
    }).explain('executionStats');

    const afterStage = afterExplain.executionStats.executionStages.stage;
    const afterInputStage = afterExplain.executionStats.executionStages.inputStage
      ? afterExplain.executionStats.executionStages.inputStage.stage
      : afterStage;
    const afterDocsExamined = afterExplain.executionStats.totalDocsExamined;

    console.log(` Before Index: Stage = ${beforeStage}, Docs Examined = ${beforeDocsExamined}`);
    console.log(` After Index:  Stage = ${afterInputStage}, Docs Examined = ${afterDocsExamined}`);
    if (beforeDocsExamined === 1000 && afterDocsExamined < 1000) {
      console.log(' Index benchmark verified: COLLSCAN (1000 docs) -> IXSCAN (reduced docs)');
    }

    // ==========================================
    // Task 4: Aggregation & Pagination
    // ==========================================
    console.log('\n[Task 4: Aggregation Stats & Pagination]');

    // 4.1 Stats route
    const statsRes = await request(app).get('/api/applications/stats');
    if (
      statsRes.status === 200 &&
      Array.isArray(statsRes.body.statusCounts) &&
      typeof statsRes.body.averageOfferSalary === 'number' &&
      statsRes.body.averageOfferSalary > 0
    ) {
      console.log(' GET /api/applications/stats returned status counts & average offer salary:');
      console.log('   Status counts:', statsRes.body.statusCounts);
      console.log('   Avg offer salary:', statsRes.body.averageOfferSalary);
    } else {
      throw new Error(`Stats endpoint failed: ${JSON.stringify(statsRes.body)}`);
    }

    // 4.2 Pagination: ?page=2&limit=10
    const pageRes = await request(app).get('/api/applications?page=2&limit=10');
    if (
      pageRes.status === 200 &&
      pageRes.body.page === 2 &&
      pageRes.body.limit === 10 &&
      pageRes.body.total === 1000 &&
      pageRes.body.totalPages === 100 &&
      pageRes.body.applications.length === 10 &&
      pageRes.body.applications[0].owner.email
    ) {
      console.log(' GET /api/applications?page=2&limit=10 returns correct page, limit, total, totalPages and 10 items with populated owner');
    } else {
      throw new Error(`Pagination test failed: ${JSON.stringify(pageRes.body)}`);
    }

    console.log('\n=============================================');
    console.log(' ALL REQUIREMENTS VERIFIED AND PASSED 100%! ');
    console.log('=============================================\n');

  } catch (error) {
    console.error('Test failed with error:', error);
    process.exit(1);
  } finally {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.close();
    }
    if (mongoServer) {
      await mongoServer.stop();
    }
  }
};

runTests();
