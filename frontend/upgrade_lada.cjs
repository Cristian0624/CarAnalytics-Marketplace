const { Document, NodeIO } = require('@gltf-transform/core');
const { KHRONOS_EXTENSIONS } = require('@gltf-transform/extensions');

async function processGLB() {
  const io = new NodeIO().registerExtensions(KHRONOS_EXTENSIONS);
  const doc = await io.read('public/lada.glb');

  // 1. Remove the huge floor plane so it zooms in correctly
  const root = doc.getRoot();
  for (const node of root.listNodes()) {
    if (node.getName() === 'Plane013' || node.getName().toLowerCase().includes('plane')) {
      // Remove it from its parent scene
      for (const scene of root.listScenes()) {
        scene.removeChild(node);
      }
      node.dispose();
      console.log('Removed floor plane node:', node.getName());
    }
  }
  for (const mesh of root.listMeshes()) {
    if (mesh.getName() === 'Plane013' || mesh.getName().toLowerCase().includes('plane')) {
      mesh.dispose();
    }
  }

  // 2. Upgrade materials to PBR
  for (const material of root.listMaterials()) {
    const name = material.getName().toLowerCase();
    
    // Default PBR
    material.setRoughnessFactor(0.4);
    material.setMetallicFactor(0.1);

    if (name.includes('car_body') || name.includes('paint')) {
      material.setMetallicFactor(0.6);
      material.setRoughnessFactor(0.2);
    }
    
    if (name.includes('glass') || name.includes('window')) {
      material.setAlphaMode('BLEND');
      material.setAlphaCutoff(0);
      material.setBaseColorFactor([0.1, 0.1, 0.1, 0.6]); // Dark transparent
      material.setRoughnessFactor(0.0);
      material.setMetallicFactor(0.3);
    }
    
    if (name.includes('chrome') || name.includes('exhaust') || name.includes('edge')) {
      material.setMetallicFactor(1.0);
      material.setRoughnessFactor(0.1);
    }
    
    if (name.includes('black') || name.includes('rub_tire') || name.includes('rubber')) {
      material.setBaseColorFactor([0.05, 0.05, 0.05, 1]); // Dark black
      material.setRoughnessFactor(0.8);
      material.setMetallicFactor(0.0);
    }
    
    if (name.includes('light')) {
      material.setRoughnessFactor(0.2);
      material.setMetallicFactor(0.1);
    }
  }

  await io.write('public/lada.glb', doc);
  console.log('Successfully upgraded Lada for PBR!');
}

processGLB().catch(console.error);
