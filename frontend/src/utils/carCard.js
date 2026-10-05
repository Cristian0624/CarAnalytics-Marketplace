export function getLogoFileName(brand) {
    if (!brand) return "unknown";
  
    let name = brand.toLowerCase().trim().replace(/ /g, "-");
  
    if (name === "mercedes") name = "mercedes-benz";
    if (name === "vw") name = "volkswagen";
  
    return `${name}.png`;
  }
  
  export function getScoreClass(score) {
    const value = Number(score);
  
    if (value < 30) return "score-red";
    if (value < 60) return "score-orange";
  
    return "score-green";
  }