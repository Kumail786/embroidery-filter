// Use tsx to load TypeScript files in workers
require('tsx/cjs');
const mod = require('./runEmbroidery.ts');
module.exports = mod.default || mod;


