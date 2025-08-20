const { register } = require('esbuild-register/dist/node');
register({ target: 'es2022' });
const mod = require('./runEmbroidery.ts');
module.exports = mod.default || mod;


