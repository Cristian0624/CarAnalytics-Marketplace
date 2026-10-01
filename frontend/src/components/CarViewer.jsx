import "@google/model-viewer";
import "./CarViewer.css";

function CarViewer() {
  return (
    <div className="car-viewer">
      <model-viewer
        src="/models/audi-r8/scene.gltf"
        alt="Audi R8 GT 3D"
        auto-rotate
        auto-rotate-delay="0"
        rotation-per-second="30deg"
        camera-controls
        disable-zoom
        shadow-intensity="1"
        exposure="1.1"
        interaction-prompt="none"
        loading="eager"
      />
      <p className="car-viewer-credit">
        3D model:{" "}
        <a
          href="https://sketchfab.com/3d-models/audi-r8-gt-type-4s-be4fbfc9e45f480bb9e629378149f7fe"
          target="_blank"
          rel="noreferrer"
        >
          Audi R8 GT (Type 4S)
        </a>{" "}
        by GT Cars: Hyperspeed, CC-BY-4.0
      </p>
    </div>
  );
}

export default CarViewer;
