import { useEffect } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import BackgroundTriangles from "../components/BackgroundTriangles";
import "./AboutUsPage.css";

const TEAM_MEMBERS = [
  {
    id: "maxim",
    name: "Siloci Maxim",
    image: "/team/siloci-maxim.jpg",
    imagePosition: "center 20%",
  },
  {
    id: "dan",
    name: "Rotari Dan",
    image: "/team/rotari-dan.jpg",
    imagePosition: "62% 22%",
  },
  {
    id: "cristian",
    name: "Gluhu Cristian",
    image: "/team/gluhu-cristian.jpg",
    imagePosition: "center 22%",
  },
  {
    id: "mihai",
    name: "Stamati Mihai",
    image: "/team/stamati-mihai.jpg",
    imagePosition: "center 22%",
  },
  {
    id: "marius",
    name: "Gheorghița Marius",
    image: "/team/gheorghita-marius.png",
    imagePosition: "center 22%",
  },
];

export default function AboutUsPage() {
  const { t } = useTranslation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <main className="about-page">
      <BackgroundTriangles />

      <div className="about-container">
        <header className="about-hero">
          <span className="about-badge">{t("aboutUs.badge")}</span>
          <h1>
            {t("aboutUs.titlePrefix")}{" "}
            <span className="about-brand-highlight">
              Face<span>Auto</span>
            </span>
          </h1>
          <p className="about-subtitle">{t("aboutUs.subtitle")}</p>
        </header>

        <section className="about-mission-grid">
          <article className="about-mission-card">
            <span className="about-card-eyebrow">
              {t("aboutUs.mission.eyebrow")}
            </span>
            <h2>{t("aboutUs.mission.title")}</h2>
            <p>{t("aboutUs.mission.description")}</p>
          </article>

          <article className="about-mission-card">
            <span className="about-card-eyebrow">
              {t("aboutUs.vision.eyebrow")}
            </span>
            <h2>{t("aboutUs.vision.title")}</h2>
            <p>{t("aboutUs.vision.description")}</p>
          </article>
        </section>

        <section className="about-team-section">
          <div className="about-section-heading">
            <span className="about-badge">{t("aboutUs.teamBadge")}</span>
            <h2>{t("aboutUs.teamTitle")}</h2>
            <p>{t("aboutUs.teamSubtitle")}</p>
          </div>

          <div className="about-team-grid">
            {TEAM_MEMBERS.map((member) => {
              const tags = t(`aboutUs.members.${member.id}.tags`, {
                returnObjects: true,
              });

              return (
                <article key={member.id} className="team-card">
                  <div className="team-photo-wrapper">
                    <img
                      src={member.image}
                      alt={member.name}
                      style={{ objectPosition: member.imagePosition }}
                    />
                    <span className="team-role-pill">
                      {t(`aboutUs.members.${member.id}.role`)}
                    </span>
                  </div>

                  <div className="team-card-body">
                    <h3>{member.name}</h3>

                    {Array.isArray(tags) && (
                      <div className="team-tags">
                        {tags.map((tag) => (
                          <span key={tag} className="team-tag">
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}

                    <p>{t(`aboutUs.members.${member.id}.description`)}</p>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <div className="about-footer-action">
          <Link to="/" className="about-home-btn">
            {t("aboutUs.backHome")}
          </Link>
        </div>
      </div>
    </main>
  );
}

