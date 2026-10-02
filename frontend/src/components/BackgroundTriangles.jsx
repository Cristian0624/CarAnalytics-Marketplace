import "./BackgroundTriangles.css";

const TRIANGLES = [
  { id: 1, side: "left", top: "5%", size: 120, color: "#d32f2f", delay: "-0s", rot: 15, offset: "-30px" },
  { id: 2, side: "left", top: "25%", size: 80, color: "#ed6c02", delay: "-2s", rot: -45, offset: "10px" },
  { id: 3, side: "left", top: "45%", size: 150, color: "#2e7d32", delay: "-4s", rot: 30, offset: "-40px" },
  { id: 4, side: "left", top: "65%", size: 90, color: "#d32f2f", delay: "-1s", rot: 110, offset: "20px" },
  { id: 5, side: "left", top: "85%", size: 110, color: "#ed6c02", delay: "-3s", rot: -20, offset: "-10px" },
  { id: 6, side: "right", top: "10%", size: 100, color: "#2e7d32", delay: "-1.5s", rot: 60, offset: "15px" },
  { id: 7, side: "right", top: "30%", size: 140, color: "#d32f2f", delay: "-3.5s", rot: -15, offset: "-25px" },
  { id: 8, side: "right", top: "50%", size: 90, color: "#ed6c02", delay: "-0.5s", rot: 45, offset: "30px" },
  { id: 9, side: "right", top: "75%", size: 130, color: "#2e7d32", delay: "-2.5s", rot: -80, offset: "-35px" },
  { id: 10, side: "right", top: "90%", size: 80, color: "#d32f2f", delay: "-4.5s", rot: 25, offset: "5px" },
];

function BackgroundTriangles() {
  return (
    <div className="background-shapes" aria-hidden="true">
      {TRIANGLES.map((t) => (
        <svg
          key={t.id}
          className="floating-shape"
          style={{
            width: t.size,
            height: t.size,
            color: t.color,
            top: t.top,
            [t.side]: t.offset,
            animationDelay: t.delay,
            "--rot": `${t.rot}deg`,
          }}
          viewBox="-20 -20 140 140"
          xmlns="http://www.w3.org/2000/svg"
        >
          <polygon
            points="50,0 100,100 0,100"
            fill="currentColor"
            stroke="currentColor"
            strokeWidth="30"
            strokeLinejoin="round"
          />
        </svg>
      ))}
    </div>
  );
}

export default BackgroundTriangles;
