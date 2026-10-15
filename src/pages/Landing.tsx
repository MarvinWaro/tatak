import { type CSSProperties, useEffect, useState } from "react";
import { type CardColor, type InkColor, themeVars } from "../../shared/theme";
import type { Promo } from "../../shared/types";
import { BrandLogo, type IconName } from "../components/Icon";
import { StampCard } from "../components/StampCard";
import { Link } from "../lib/router";

const DAY = 86400000;
const now = Date.now();

interface Sample {
  label: string;
  shopName: string;
  code: string;
  required: number;
  stamps: number;
  card: CardColor;
  ink: InkColor;
  icon: IconName;
  promos?: Promo[];
}

// Made-up shops that show the card works for any kind of business.
const SAMPLES: Sample[] = [
  { label: "Coffee", shopName: "Brew Corner", code: "K7Q4MZ", required: 10, stamps: 7, card: "canary", ink: "violet", icon: "cup" },
  { label: "Milk tea", shopName: "Tea Time", code: "M2T8RA", required: 8, stamps: 5, card: "blush", ink: "red", icon: "cup" },
  {
    label: "Bakery",
    shopName: "Daily Pandesal",
    code: "B4K9PN",
    required: 10,
    stamps: 4,
    card: "kraft",
    ink: "brown",
    icon: "gift",
    promos: [{ step: 5, percentOff: 50, label: "50% off" }],
  },
  { label: "Barbershop", shopName: "Fresh Cuts", code: "F6C3XH", required: 6, stamps: 3, card: "sky", ink: "blue", icon: "gift" },
];

/** Stamp dates spread over the past few weeks, newest first. */
function sampleDates(count: number): number[] {
  return Array.from({ length: count }, (_, i) => now - i * 2.5 * DAY);
}

export function Landing() {
  const [picked, setPicked] = useState(0);
  const sample = SAMPLES[picked];

  useEffect(() => {
    document.title = "Tatak | Free stamp cards for local shops";
  }, []);

  return (
    <div className="site">
      <nav className="site-nav">
        <Link to="/" className="brand">
          <BrandLogo />
        </Link>
        <Link to="/login" className="btn btn--ghost btn--sm">
          Log in
        </Link>
      </nav>

      <section className="hero">
        <div>
          <h1>The stamp card that can't run out, tear, or get lost.</h1>
          <p className="hero-lede">
            Tatak puts your shop's loyalty card on your customers' phones. They scan your QR code once, pick their
            order, and you hold a button on their screen to stamp it. Free to use.
          </p>
          <div className="hero-actions">
            <Link to="/register" className="btn btn--big">
              Set up my shop
            </Link>
            <Link to="/login" className="btn btn--big btn--ghost">
              Log in
            </Link>
          </div>
        </div>

        <div className="hero-sample">
          <div className="chips hero-picker" role="group" aria-label="Show a sample card for">
            {SAMPLES.map((s, i) => (
              <button
                key={s.label}
                type="button"
                className="chip"
                aria-pressed={i === picked}
                onClick={() => setPicked(i)}
              >
                {s.label}
              </button>
            ))}
          </div>
          <div className="hero-card" style={themeVars(sample.card, sample.ink) as CSSProperties}>
            <StampCard
              key={sample.label}
              shopName={sample.shopName}
              code={sample.code}
              required={sample.required}
              stamps={sample.stamps}
              stampDates={sampleDates(sample.stamps)}
              rewardIcon={sample.icon}
              promos={sample.promos}
              fresh={sample.stamps}
              timezone="Asia/Manila"
            />
          </div>
          <p className="hero-note">A sample card. Yours shows your shop's name, colors and reward.</p>
        </div>
      </section>

      <section className="landing-section" aria-labelledby="how-title">
        <h2 id="how-title">How it works</h2>
        <ol className="steps">
          <li>
            <div>
              <h3>Add your menu</h3>
              <p>Type in what you sell and the prices. Mark sold-out items with one tap.</p>
            </div>
          </li>
          <li>
            <div>
              <h3>Print your QR poster</h3>
              <p>Tape it to your counter. Customers scan it once to get a card. No app to install.</p>
            </div>
          </li>
          <li>
            <div>
              <h3>Hold to stamp</h3>
              <p>Customers pick their order on their phone and show it to you. Hold the button and type your PIN.</p>
            </div>
          </li>
          <li>
            <div>
              <h3>See every sale</h3>
              <p>Your daily report shows your best sellers, your busiest hours, and how many rewards you gave.</p>
            </div>
          </li>
        </ol>
      </section>

      <section className="landing-section" aria-labelledby="why-title">
        <h2 id="why-title">Why shops switch from paper</h2>
        <ul className="why">
          <li>
            <h3>No app, no sign-up</h3>
            <p>The card opens in the phone's browser. It works on any phone, even cheap ones.</p>
          </li>
          <li>
            <h3>Nothing to reprint</h3>
            <p>No more cards that run out, tear, or get left at home. A backup code brings a card back on a new phone.</p>
          </li>
          <li>
            <h3>Only you can stamp</h3>
            <p>Every stamp needs your hold and your 4-digit PIN, so customers can't stamp their own cards.</p>
          </li>
        </ul>
      </section>

      <section className="cta-band">
        <h2>Ready for your regulars?</h2>
        <p>Setting up takes about 2 minutes. Free for small shops.</p>
        <Link to="/register" className="btn btn--big btn--bond">
          Set up my shop
        </Link>
      </section>

      <footer className="site-foot">Tatak is free for small local shops in the Philippines.</footer>
    </div>
  );
}
