const mongoose = require('mongoose');
const dotenv = require('dotenv');
const User = require('./models/User');
const Application = require('./models/Application');

dotenv.config();

const runExplain = async () => {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);

    const user = await User.findOne();
    if (!user) {
      console.log('No users found. Please run "npm run seed" first.');
      process.exit(1);
    }

    console.log(`\nTesting query on user: ${user.name} (${user._id})`);
    console.log('Query: find({ owner: user._id, status: "Interview" })\n');

    // 1. Drop compound index if it exists to measure COLLSCAN
    const existingIndexes = await Application.collection.indexes();
    const compoundIndexExists = existingIndexes.some(
      (idx) => idx.key && idx.key.owner === 1 && idx.key.status === 1
    );

    if (compoundIndexExists) {
      console.log('Dropping compound index { owner: 1, status: 1 } to test unindexed query...');
      await Application.collection.dropIndex({ owner: 1, status: 1 });
    }

    // 2. Run query BEFORE index (COLLSCAN)
    console.log('\n--- 1. BEFORE INDEX (COLLSCAN) ---');
    const beforeStats = await Application.find({
      owner: user._id,
      status: 'Interview'
    }).explain('executionStats');

    const beforeExecution = beforeStats.executionStats;
    const beforeStage = beforeExecution.executionStages.stage;
    const beforeDocsExamined = beforeExecution.totalDocsExamined;
    const beforeKeysExamined = beforeExecution.totalKeysExamined;
    const beforeDocsReturned = beforeExecution.nReturned;
    const beforeTime = beforeExecution.executionTimeMillis;

    console.log(`Execution Stage:        ${beforeStage}`);
    console.log(`Documents Examined:     ${beforeDocsExamined}`);
    console.log(`Keys Examined:          ${beforeKeysExamined}`);
    console.log(`Documents Returned:     ${beforeDocsReturned}`);
    console.log(`Execution Time:         ${beforeTime} ms`);

    // 3. Add compound index { owner: 1, status: 1 }
    console.log('\nAdding compound index { owner: 1, status: 1 }...');
    await Application.collection.createIndex({ owner: 1, status: 1 });
    console.log('Index created successfully.');

    // 4. Run query AFTER index (IXSCAN)
    console.log('\n--- 2. AFTER INDEX (IXSCAN) ---');
    const afterStats = await Application.find({
      owner: user._id,
      status: 'Interview'
    }).explain('executionStats');

    const afterExecution = afterStats.executionStats;
    const afterStage = afterExecution.executionStages.stage;
    // In Mongoose / Mongo, IXSCAN is usually inside a FETCH stage
    const afterInputStage = afterExecution.executionStages.inputStage
      ? afterExecution.executionStages.inputStage.stage
      : afterStage;
    const afterDocsExamined = afterExecution.totalDocsExamined;
    const afterKeysExamined = afterExecution.totalKeysExamined;
    const afterDocsReturned = afterExecution.nReturned;
    const afterTime = afterExecution.executionTimeMillis;

    console.log(`Execution Stage:        ${afterStage} (${afterInputStage})`);
    console.log(`Documents Examined:     ${afterDocsExamined}`);
    console.log(`Keys Examined:          ${afterKeysExamined}`);
    console.log(`Documents Returned:     ${afterDocsReturned}`);
    console.log(`Execution Time:         ${afterTime} ms`);

    // 5. Summary comparison
    console.log('\n======================================================');
    console.log('                 COMPARISON SUMMARY                   ');
    console.log('======================================================');
    console.log(`Metric                  | Before (No Index) | After (Compound Index)`);
    console.log(`------------------------|-------------------|-----------------------`);
    console.log(`Query Stage             | ${beforeStage.padEnd(17)} | ${afterInputStage.padEnd(21)}`);
    console.log(`Documents Examined      | ${String(beforeDocsExamined).padEnd(17)} | ${String(afterDocsExamined).padEnd(21)}`);
    console.log(`Keys Examined           | ${String(beforeKeysExamined).padEnd(17)} | ${String(afterKeysExamined).padEnd(21)}`);
    console.log(`Documents Returned      | ${String(beforeDocsReturned).padEnd(17)} | ${String(afterDocsReturned).padEnd(21)}`);
    console.log(`Execution Time          | ${(beforeTime + ' ms').padEnd(17)} | ${(afterTime + ' ms').padEnd(21)}`);
    console.log('======================================================\n');

  } catch (error) {
    console.error('Explain error:', error.message);
  } finally {
    await mongoose.connection.close();
    console.log('Database connection closed.');
  }
};

runExplain();
