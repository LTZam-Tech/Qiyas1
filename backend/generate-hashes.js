const bcrypt = require('bcrypt');

const passwords = {
  'AdminPass123': null,
  'DeanPass123': null,
  'ConsultPass123': null,
  'UserPass123': null,
};

async function generateHashes() {
  console.log('Generating bcrypt hashes...\n');
  
  for (const [password, _] of Object.entries(passwords)) {
    const hash = await bcrypt.hash(password, 12);
    passwords[password] = hash;
    console.log(`${password}: ${hash}`);
  }
  
  console.log('\n\nSQL INSERT statements:');
  console.log('-- Copy these hashes into your migration file');
}

generateHashes().catch(console.error);
