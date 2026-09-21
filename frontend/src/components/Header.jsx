import HomeButton from "./HomeButton";
import AuthButton from "./AuthButton";
import "./Header.css";

function Header() {
  return (
    <header className="site-header">
      <div className="header-left">
        <HomeButton />
      </div>
      <div className="header-brand" aria-label="Used-Car Marketplace">
        <img src="/icon1.png" alt="Used-Car Marketplace logo" />
        <span>Used-Car Marketplace</span>
      </div>
      <div className="header-right">
        <AuthButton />
      </div>
    </header>
  );
}

export default Header;
