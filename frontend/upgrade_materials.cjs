const { Document, NodeIO } = require('@gltf-transform/core');
const { KHRONOS_EXTENSIONS } = require('@gltf-transform/extensions');

async function processGLB() {
  const io = new NodeIO().registerExtensions(KHRONOS_EXTENSIONS);
  const doc = await io.read('public/r8.glb');

  for (const material of doc.getRoot().listMaterials()) {
    const name = material.getName().toLowerCase();
    
    // Set everything to PBR defaults instead of flat matte
    material.setRoughnessFactor(0.5);
    material.setMetallicFactor(0.1);

    if (name.includes('paint metallic') || name.includes('silver')) {
      material.setMetallicFactor(0.8);
      material.setRoughnessFactor(0.2);
      material.setBaseColorFactor([0.8, 0.8, 0.85, 1]); // Silver paint
    }
    
    if (name.includes('glass')) {
      material.setAlphaMode('BLEND');
      material.setAlphaCutoff(0);
      material.setBaseColorFactor([0.1, 0.1, 0.1, 0.7]); // Dark transparent
      material.setRoughnessFactor(0.0);
      material.setMetallicFactor(0.2);
    }
    
    if (name.includes('carbon') || name.includes('gloss black') || name.includes('paint matte black')) {
      material.setBaseColorFactor([0.05, 0.05, 0.05, 1]); // Dark black
      material.setRoughnessFactor(0.3);
    }
    
    if (name.includes('steel') || name.includes('aluminium') || name.includes('aluminum')) {
      material.setMetallicFactor(0.9);
      material.setRoughnessFactor(0.4);
    }

    if (name.includes('tire')) {
      material.setBaseColorFactor([0.1, 0.1, 0.1, 1]);
      material.setRoughnessFactor(0.9);
      material.setMetallicFactor(0.0);
    }

    if (name.includes('red')) {
      material.setBaseColorFactor([0.8, 0.1, 0.1, 1]); // Brake calipers
      material.setRoughnessFactor(0.3);
      material.setMetallicFactor(0.2);
    }
  }

  await io.write('public/r8.glb', doc);
  console.log('Successfully upgraded materials for PBR!');
}

processGLB().catch(console.error);
