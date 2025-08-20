const { register } = await import('esbuild-register/dist/node.js');
register({ target: 'es2022' });
const mod = await import('./runEmbroidery.ts');
export default mod.default;


