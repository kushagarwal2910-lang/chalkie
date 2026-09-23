import * as tldraw from 'tldraw';

for (const util of tldraw.defaultShapeUtils) {
  try {
    const instance = new util(null);
    console.log(`\n--- Shape: ${util.type} ---`);
    console.log("defaultProps:", instance.getDefaultProps?.());
  } catch (e) {
    console.log(`Could not instantiate ${util.type}:`, e.message);
  }
}
