import { StampCard } from "../components/StampCard";
import { BrandMark } from "../components/Icon";
import { Link } from "../lib/router";

const DAY = 86400000;
// A sample card for the page: seven stamps from the past few weeks.
const sampleDates = [0, 2, 3, 6, 9, 13, 16].map((d) => Date.now() - d * DAY);

export function Landing() {
  return (
    <div className="site">
      <nav className="site-nav">
        <Link to="/" className="brand">
          <BrandMark />
          Tatak
        </Link>
        <Link to="/login" className="btn btn--ghost btn--sm">
          Log in
        </Link>
      </nav>

      <section className="hero">
        <div>
          <h1>The stamp card that can't run out, tear, or get lost.</h1>
          <p className="hero-lede">
            Tatak puts your coffee stall's loyalty card on your customers' phones. They scan your QR code once, pick
            their order, and you hold a button on their screen to stamp it. Free to use.
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
        <StampCard
          className="hero-card"
          shopName="Kape sa Kanto"
          code="K7Q4MZ"
          required={10}
          stamps={7}
          stampDates={sampleDates}
          rewardText="1 free coffee"
          timezone="Asia/Manila"
        />
      </section>

      <ol className="steps">
        <li>
          <div>
            <h3>Add your menu</h3>
            <p>Type in your drinks and prices. Mark sold-out items with one tap.</p>
          </div>
        </li>
        <li>
          <div>
            <h3>Print your QR poster</h3>
            <p>Tape it to your cart. Customers scan it once to get a card. No app to install.</p>
          </div>
        </li>
        <li>
          <div>
            <h3>Hold to stamp</h3>
            <p>Customers pick their order on their phone and show it to you. Press and hold the button to stamp it.</p>
          </div>
        </li>
        <li>
          <div>
            <h3>See every sale</h3>
            <p>Your daily report shows sales per drink, your busiest hours, and how many free coffees you gave.</p>
          </div>
        </li>
      </ol>

      <footer className="site-foot">Tatak is free for small coffee stalls.</footer>
    </div>
  );
}
