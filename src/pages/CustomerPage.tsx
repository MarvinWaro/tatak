import { type CSSProperties, useEffect, useState } from "react";
import { promoDiscount, promoNeedsStampItem, readyPromo } from "../../shared/promos";
import type { CardCreated, CardView, OrderResult, Promo, PublicShop } from "../../shared/types";
import { HoldButton } from "../components/HoldButton";
import { Icon } from "../components/Icon";
import {
  MenuPicker,
  type OrderLine,
  type Quantities,
  apiLines,
  apiRef,
  orderLines,
  pickLine,
} from "../components/MenuPicker";
import { PinPad } from "../components/PinPad";
import { StampCard } from "../components/StampCard";
import { ApiError, api, errorMessage } from "../lib/api";
import { itemsText, ordinal, peso, plural, timeOf, whenOf } from "../lib/format";
import { backupSeenKey, cardKey, readItem, removeItem, writeItem } from "../lib/storage";
import { useShopTheme } from "../lib/theme";

type View =
  | { kind: "card" }
  | { kind: "order" }
  | { kind: "handoff" }
  | { kind: "done"; result: OrderResult; freeItem?: string; promo?: Promo };

/** What this order uses: a promo and the line it goes on, and the free line when it reaches the free box. */
interface OrderChoice {
  promo: Promo | null;
  /** Null for a 0% promo, which the barista gives by hand. */
  promoLine: OrderLine | null;
  freeLine: OrderLine | null;
}

/** A perk the order screen offers: a promo, or the free box. */
interface Perk {
  key: string;
  /** "50% off" or "free coffee". */
  name: string;
  /** Why it's offered and how it works, shown under its checkbox. */
  note: string;
  question: string;
  use: boolean;
  setUse: (v: boolean) => void;
  /** Lines it can go on. Empty for a 0% promo, which needs no item. */
  lines: OrderLine[];
  line: OrderLine | null;
  setLineKey: (key: string) => void;
  /** Centavos it takes off one unit of a line. */
  off: (line: OrderLine) => number;
}

/** Centavos the promo and the free item take off the order. */
function choiceOff(choice: OrderChoice): number {
  const promoOff =
    choice.promo && choice.promoLine ? promoDiscount(choice.promoLine.unitCents, choice.promo.percentOff) : 0;
  return promoOff + (choice.freeLine?.unitCents ?? 0);
}

/** "1 free coffee" reads better as "free coffee" in sentences like "Use my free coffee". */
const rewardName = (text: string) => text.replace(/^1\s+/, "");

function formatHHMM(value: string): string {
  const [h, m] = value.split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")} ${suffix}`;
}

export function CustomerPage({ slug }: { slug: string }) {
  const [token, setToken] = useState<string | null>(() => readItem(cardKey(slug)));
  const [cardView, setCardView] = useState<CardView | null>(null);
  const [shop, setShop] = useState<PublicShop | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [view, setView] = useState<View>({ kind: "card" });
  const [qty, setQty] = useState<Quantities>({});
  const [usePromo, setUsePromo] = useState(true);
  const [promoKey, setPromoKey] = useState<string | null>(null);
  const [useFree, setUseFree] = useState(true);
  const [freeKey, setFreeKey] = useState<string | null>(null);

  // Load the card if this phone has one, otherwise just the shop.
  useEffect(() => {
    let cancelled = false;
    setLoadError(null);
    const load = async () => {
      if (token) {
        try {
          const data = await api<CardView>("/api/card", { cardToken: token });
          if (cancelled) return;
          if (data.shop.slug !== slug) throw new ApiError("Card is for another shop.", 401, "no_card");
          setCardView(data);
          setShop(data.shop);
          return;
        } catch (err) {
          if (cancelled) return;
          if (err instanceof ApiError && err.code === "no_card") {
            removeItem(cardKey(slug));
            setToken(null);
            return;
          }
          setLoadError(errorMessage(err));
          return;
        }
      }
      try {
        const data = await api<PublicShop>(`/api/shops/${encodeURIComponent(slug)}`);
        if (!cancelled) setShop(data);
      } catch (err) {
        if (!cancelled) setLoadError(errorMessage(err));
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [slug, token]);

  useEffect(() => {
    if (shop) document.title = `${shop.name} stamp card`;
  }, [shop]);
  useShopTheme(shop?.cardColor, shop?.inkColor);

  const saveCard = (created: CardCreated) => {
    writeItem(cardKey(slug), created.token);
    setCardView(created);
    setShop(created.shop);
    setToken(created.token);
  };

  if (loadError) {
    return (
      <main className="phone">
        <div className="panel empty" style={{ marginTop: 40 }}>
          <h1 className="page-title">This page didn't load</h1>
          <p>{loadError}</p>
          <button className="btn" onClick={() => location.reload()}>
            Try again
          </button>
        </div>
      </main>
    );
  }

  if (!shop || (token && !cardView)) {
    return (
      <main className="phone" aria-busy="true">
        <div className="skeleton" style={{ height: 40, width: "60%", marginBottom: 20 }} />
        <div className="skeleton" style={{ height: 250 }} />
      </main>
    );
  }

  if (!cardView || !token) {
    return <NoCard shop={shop} slug={slug} onCard={saveCard} />;
  }

  const menu = cardView.shop.menu;
  const update = (next: CardView) => {
    setCardView(next);
    setShop(next.shop);
  };
  const lines = orderLines(menu, qty);
  const { stamps, promosUsed } = cardView.card;
  const { promos, stampsRequired: required, stampMode, rewardText } = cardView.shop;
  const stampLines = lines.filter((l) => l.item.earnsStamp);
  const stampItems = stampLines.reduce((n, l) => n + l.qty, 0);
  const earns = stampMode === "per_cup" ? stampItems : stampItems > 0 ? 1 : 0;
  // Promos and the free box count this order's stamps: at 4 stamps, 2 cups reach a stamp-5 promo;
  // on a 10-box card at 9 stamps, the next cup lands on the free box.
  const stampsAfter = stamps + earns;

  // The cup that lands on the free box is free, so it must be an item that earns a stamp.
  const freeOffered = stampsAfter >= required && stampLines.length > 0;
  const freeLine = freeOffered && useFree ? pickLine(stampLines, freeKey) : null;

  // A promo reached by this order goes on a stamped cup; one saved from before can go on any item.
  // It can't share the free unit, so an item ordered once can't be both free and discounted.
  const promoNow = readyPromo(promos, stamps, promosUsed);
  const reached = readyPromo(promos, stampsAfter, promosUsed);
  const promoLines = reached
    ? (promoNeedsStampItem(reached, stamps) ? stampLines : lines).filter(
        (l) => !(freeLine && l.key === freeLine.key && l.qty < 2),
      )
    : [];
  const promo = reached && (reached.percentOff === 0 || promoLines.length > 0) ? reached : null;
  const promoLine = promo && usePromo && promo.percentOff > 0 ? pickLine(promoLines, promoKey) : null;
  const choice: OrderChoice = { promo: promo && usePromo ? promo : null, promoLine, freeLine };

  const freeName = rewardName(rewardText);
  const perks: Perk[] = [];
  if (freeOffered) {
    perks.push({
      key: "free",
      name: freeName,
      note: `${stamps >= required ? "" : `This order reaches box ${required}, the free one. `}One item that earns a stamp is free. Untick to save it for later.`,
      question: "Which one is free?",
      use: useFree,
      setUse: setUseFree,
      lines: stampLines,
      line: freeLine,
      setLineKey: setFreeKey,
      off: (line) => line.unitCents,
    });
  }
  if (promo) {
    perks.push({
      key: "promo",
      name: promo.label,
      note: `${promoNow?.step === promo.step ? "" : `This order reaches stamp ${promo.step}. `}${
        promo.percentOff > 0 ? "On one item in this order." : "The barista gives it to you."
      } Untick to save it for later.`,
      question: `Which item gets the ${promo.label}?`,
      use: usePromo,
      setUse: setUsePromo,
      lines: promo.percentOff > 0 ? promoLines : [],
      line: promoLine,
      setLineKey: setPromoKey,
      off: (line) => promoDiscount(line.unitCents, promo.percentOff),
    });
  }

  // A note at the top of the order screen when a perk is ready before picking anything.
  const readyNote =
    stamps >= required - 1
      ? `Your ${freeName} is ready. Add something that earns a stamp, then pick below which one is free.`
      : promoNow
        ? `Your ${promoNow.label} is ready. ${
            promoNow.percentOff > 0 ? "Pick your order, then choose below which item gets it." : "You can use it below."
          }`
        : null;

  switch (view.kind) {
    case "order":
      return (
        <OrderPicker
          shop={cardView.shop}
          qty={qty}
          setQty={setQty}
          lines={lines}
          readyNote={readyNote}
          perks={perks}
          off={choiceOff(choice)}
          onBack={() => setView({ kind: "card" })}
          onNext={() => setView({ kind: "handoff" })}
        />
      );
    case "handoff":
      return (
        <Handoff
          shop={cardView.shop}
          card={cardView}
          lines={lines}
          choice={choice}
          token={token}
          onBack={() => setView({ kind: "order" })}
          onMenuChanged={update}
          onDone={(result) => {
            update(result);
            setQty({});
            setUsePromo(true);
            setPromoKey(null);
            setUseFree(true);
            setFreeKey(null);
            setView({ kind: "done", result, promo: choice.promo ?? undefined, freeItem: choice.freeLine?.name });
          }}
        />
      );
    case "done":
      return (
        <Done
          result={view.result}
          freeItem={view.freeItem}
          promo={view.promo}
          onClose={() => setView({ kind: "card" })}
        />
      );
    default:
      return (
        <CardHome
          slug={slug}
          view={cardView}
          token={token}
          onUpdate={update}
          onOrder={() => setView({ kind: "order" })}
          promo={promoNow}
        />
      );
  }
}

/** The shop's name, with its logo when it has one. */
function ShopHeading({ shop, style }: { shop: PublicShop; style?: CSSProperties }) {
  return (
    <div className="shop-heading" style={style}>
      {shop.logoUrl && <img className="shop-logo" src={shop.logoUrl} alt="" />}
      <h1 className="shop-title">{shop.name}</h1>
    </div>
  );
}

/* ---------------- No card yet ---------------- */

function NoCard({ shop, slug, onCard }: { shop: PublicShop; slug: string; onCard: (c: CardCreated) => void }) {
  const [nickname, setNickname] = useState("");
  const [mode, setMode] = useState<"new" | "restore">("new");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      onCard(await api<CardCreated>(`/api/shops/${slug}/cards`, { method: "POST", body: { nickname } }));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const restore = async () => {
    setBusy(true);
    setError(null);
    try {
      onCard(await api<CardCreated>(`/api/shops/${slug}/cards/restore`, { method: "POST", body: { code } }));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const unit = shop.stampMode === "per_cup" ? "cup" : "order";

  return (
    <main className="phone">
      <ShopHeading shop={shop} />
      <p className="muted" style={{ margin: "6px 0 20px" }}>
        Digital stamp card
      </p>
      <StampCard
        shopName={shop.name}
        required={shop.stampsRequired}
        stamps={0}
        stampDates={[]}
        rewardText={shop.rewardText}
        timezone={shop.timezone}
        logoUrl={shop.logoUrl}
      />

      {mode === "new" ? (
        <form
          className="stack"
          style={{ marginTop: 24 }}
          onSubmit={(e) => {
            e.preventDefault();
            void create();
          }}
        >
          <p className="card-status" style={{ marginTop: 0 }}>
            Get a stamp for every {unit}. {shop.stampsRequired} stamps get you {shop.rewardText}.
          </p>
          <div className="field">
            <label htmlFor="nickname">Your name (optional)</label>
            <input
              id="nickname"
              className="input"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              maxLength={30}
              autoComplete="given-name"
            />
            <span className="field-hint">So the barista knows whose card it is.</span>
          </div>
          {error && <p className="form-error">{error}</p>}
          <button type="button" className="link-btn" onClick={() => (setMode("restore"), setError(null))}>
            I already have a card on another phone
          </button>
          <div className="dock">
            <div className="dock-inner">
              <button type="submit" className="btn btn--big btn--block" disabled={busy}>
                {busy ? "Making your card…" : "Get my stamp card"}
              </button>
            </div>
          </div>
        </form>
      ) : (
        <form
          className="stack"
          style={{ marginTop: 24 }}
          onSubmit={(e) => {
            e.preventDefault();
            void restore();
          }}
        >
          <h2 className="panel-title">Bring back your card</h2>
          <div className="field">
            <label htmlFor="code">Backup code</label>
            <input
              id="code"
              className="input input--code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="XXXX-XXXX"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
            />
            <span className="field-hint">You saw this code when you backed up your card.</span>
          </div>
          {error && <p className="form-error">{error}</p>}
          <button type="button" className="link-btn" onClick={() => (setMode("new"), setError(null))}>
            Make a new card instead
          </button>
          <div className="dock">
            <div className="dock-inner">
              <button type="submit" className="btn btn--big btn--block" disabled={busy || code.trim() === ""}>
                {busy ? "Looking for your card…" : "Restore my card"}
              </button>
            </div>
          </div>
        </form>
      )}
    </main>
  );
}

/* ---------------- Card home ---------------- */

function CardHome({
  slug,
  view,
  token,
  onUpdate,
  onOrder,
  promo,
}: {
  slug: string;
  view: CardView;
  token: string;
  onUpdate: (v: CardView) => void;
  onOrder: () => void;
  /** A promo reached on an earlier visit and not used yet. */
  promo: Promo | null;
}) {
  const { shop, card } = view;
  const [showBackup, setShowBackup] = useState(false);
  const [backupSeen, setBackupSeen] = useState(() => readItem(backupSeenKey(slug)) === "1");
  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState(card.nickname ?? "");
  const [nameError, setNameError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // The last box is the free one: at 9 stamps on a 10-box card, the next cup is free.
  const required = shop.stampsRequired;
  const freeReady = card.stamps >= required - 1;
  const freeName = rewardName(shop.rewardText);
  const hasMenu = shop.menu.length > 0;
  const formattedCode = token.match(/.{1,4}/g)?.join("-") ?? token;

  const openBackup = () => {
    setShowBackup(true);
    setBackupSeen(true);
    writeItem(backupSeenKey(slug), "1");
  };

  const saveName = async () => {
    setNameError(null);
    try {
      onUpdate(await api<CardView>("/api/card", { method: "PATCH", body: { nickname: name }, cardToken: token }));
      setEditingName(false);
    } catch (err) {
      setNameError(errorMessage(err));
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(formattedCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked; the code is selectable on screen.
    }
  };

  let status: string;
  if (card.isBlocked) status = "This card is paused. Please talk to the barista.";
  else if (freeReady) status = `Your ${freeName} is next! Tap Order and pick it.`;
  else if (promo) status = `Your ${promo.label} is ready. Use it on your next order.`;
  else {
    const left = required - 1 - card.stamps;
    status =
      card.stamps === 0
        ? `Buy ${required - 1}, get the ${ordinal(required)} free.`
        : `${card.stamps} of ${required} stamps. ${left} more, then the next one is free.`;
    const nextPromo = shop.promos.find((p) => p.step === card.stamps + 1 && !card.promosUsed.includes(p.step));
    if (nextPromo) status += ` Next stamp: ${nextPromo.label}!`;
  }

  return (
    <main className="phone">
      <ShopHeading shop={shop} style={{ marginBottom: 20 }} />
      <StampCard
        shopName={card.nickname ? `${card.nickname}'s card` : shop.name}
        code={card.code}
        required={shop.stampsRequired}
        stamps={card.stamps}
        stampDates={view.stampDates}
        rewardText={shop.rewardText}
        timezone={shop.timezone}
        logoUrl={shop.logoUrl}
        promos={shop.promos}
      />
      <p className="card-status">{status}</p>
      {shop.openTime && shop.closeTime && (
        <p className="small muted" style={{ marginTop: 4 }}>
          Stamps work from {formatHHMM(shop.openTime)} to {formatHHMM(shop.closeTime)}.
        </p>
      )}
      {!hasMenu && <p className="form-note" style={{ marginTop: 12 }}>The menu isn't ready yet. Ask the barista.</p>}

      {!backupSeen && !showBackup && (
        <div className="form-note" style={{ marginTop: 20 }}>
          <p>Save your backup code. You'll need it to get your stamps back if you change phones.</p>
          <button className="link-btn" onClick={openBackup}>
            Show my backup code
          </button>
        </div>
      )}

      {showBackup && (
        <section className="panel stack" style={{ marginTop: 20, "--gap": "12px" } as CSSProperties}>
          <h2 className="panel-title" style={{ margin: 0 }}>
            Your backup code
          </h2>
          <code className="backup-code">{formattedCode}</code>
          <p className="small">
            Take a screenshot or write it down. On a new phone, open this shop's link and choose "I already have a card".
            Keep it private: anyone with this code can use your stamps.
          </p>
          <div className="row wrap">
            <button className="btn btn--sm" onClick={copy}>
              <Icon name="copy" /> {copied ? "Copied" : "Copy code"}
            </button>
            <button className="btn btn--sm btn--ghost" onClick={() => setShowBackup(false)}>
              Done
            </button>
          </div>
        </section>
      )}

      <section style={{ marginTop: 28 }}>
        <h2 className="panel-title">Your visits</h2>
        {view.history.length === 0 ? (
          <p className="muted small">No visits yet. Your orders and stamps will show up here.</p>
        ) : (
          <ul className="history">
            {view.history.map((h) => (
              <li key={h.id}>
                <span className={`what ${h.status === "voided" ? "voided" : ""}`}>
                  {itemsText(h.items)}
                  {h.isReward && <span className="tag history-tag">Free</span>}
                  {h.promoLabel && <span className="tag history-tag">{h.promoLabel}</span>}
                </span>
                <span className="gain">
                  {h.status === "voided"
                    ? "Voided"
                    : h.isReward
                      ? "Free"
                      : h.stampsAwarded > 0
                        ? `+${h.stampsAwarded}`
                        : peso(h.totalCents)}
                </span>
                <span className="when">
                  {whenOf(h.createdAt, shop.timezone)}
                  {h.status !== "voided" && h.totalCents > 0 && (h.isReward || h.stampsAwarded > 0)
                    ? `, ${peso(h.totalCents)}`
                    : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section style={{ marginTop: 28 }} className="stack">
        <h2 className="panel-title" style={{ marginBottom: 0 }}>
          Card settings
        </h2>
        {editingName ? (
          <form
            className="stack"
            style={{ "--gap": "10px" } as CSSProperties}
            onSubmit={(e) => {
              e.preventDefault();
              void saveName();
            }}
          >
            <div className="field">
              <label htmlFor="name">Name on card</label>
              <input id="name" className="input" value={name} maxLength={30} onChange={(e) => setName(e.target.value)} />
            </div>
            {nameError && <p className="form-error">{nameError}</p>}
            <div className="row">
              <button className="btn btn--sm" type="submit">
                Save name
              </button>
              <button className="btn btn--sm btn--ghost" type="button" onClick={() => setEditingName(false)}>
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <div className="spread">
            <span>
              Name on card: <strong>{card.nickname ?? "None"}</strong>
            </span>
            <button className="link-btn" onClick={() => setEditingName(true)}>
              Change
            </button>
          </div>
        )}
        <div className="spread">
          <span>Backup code</span>
          <button className="link-btn" onClick={openBackup}>
            Show
          </button>
        </div>
      </section>

      {!card.isBlocked && (
        <div className="dock">
          <div className="dock-inner">
            <button
              className={`btn btn--big btn--block ${freeReady ? "btn--bond" : ""}`}
              onClick={onOrder}
              disabled={!hasMenu}
            >
              {freeReady ? `Order my ${freeName}` : "Order"}
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

/* ---------------- Order picker ---------------- */

function OrderPicker({
  shop,
  qty,
  setQty,
  lines,
  readyNote,
  perks,
  off,
  onBack,
  onNext,
}: {
  shop: PublicShop;
  qty: Quantities;
  setQty: (q: Quantities) => void;
  lines: OrderLine[];
  /** Shown at the top when a perk is ready before picking anything. */
  readyNote: string | null;
  /** The free box and the promo, when this order reaches them. */
  perks: Perk[];
  /** Centavos the chosen perks take off. */
  off: number;
  onBack: () => void;
  onNext: () => void;
}) {
  const count = lines.reduce((n, l) => n + l.qty, 0);
  const total = lines.reduce((sum, l) => sum + l.qty * l.unitCents, 0) - off;

  return (
    <main className="phone">
      <div className="row" style={{ marginBottom: 12, marginLeft: -10 }}>
        <button className="icon-btn" onClick={onBack} aria-label="Back to my card">
          <Icon name="back" />
        </button>
        <span className="muted">{shop.name}</span>
      </div>
      <h1 className="shop-title" style={{ marginBottom: 20 }}>
        What are you having?
      </h1>
      {readyNote && (
        <p className="form-note" style={{ marginBottom: 16 }}>
          {readyNote}
        </p>
      )}
      <MenuPicker menu={shop.menu} qty={qty} setQty={setQty} className="panel panel--flush" />
      {perks.map((perk) => (
        <PerkPanel key={perk.key} perk={perk} />
      ))}
      <div className="dock">
        <div className="dock-inner">
          <button className="btn btn--big btn--block" disabled={count === 0} onClick={onNext}>
            {count === 0 ? "Pick your order" : `Show barista: ${plural(count, "item", "items")}, ${peso(total)}`}
          </button>
        </div>
      </div>
    </main>
  );
}

/** "Use my 50% off" or "Use my free coffee", with a choice of which item gets it. */
function PerkPanel({ perk }: { perk: Perk }) {
  return (
    <section className="panel panel--flush promo-panel" aria-label={`Your ${perk.name}`}>
      <label className="pick">
        <input type="checkbox" checked={perk.use} onChange={(e) => perk.setUse(e.target.checked)} />
        <span>
          <span className="menu-name">Use my {perk.name}</span>
          <span className="menu-meta" style={{ display: "block" }}>
            {perk.note}
          </span>
        </span>
      </label>
      {perk.use && perk.lines.length > 1 && (
        <fieldset className="promo-items">
          <legend className="small">{perk.question}</legend>
          {perk.lines.map((l) => (
            <label key={l.key} className="pick">
              <input
                type="radio"
                name={`${perk.key}-item`}
                checked={perk.line?.key === l.key}
                onChange={() => perk.setLineKey(l.key)}
              />
              <span className="spread">
                <span>{l.name}</span>
                <span className="muted tnum">−{peso(perk.off(l))}</span>
              </span>
            </label>
          ))}
        </fieldset>
      )}
      {perk.use && perk.lines.length === 1 && perk.line && (
        <p className="small muted promo-one">
          {perk.name} on 1 {perk.line.name}: −{peso(perk.off(perk.line))}
        </p>
      )}
    </section>
  );
}

/* ---------------- Barista handoff ---------------- */

function useLockScroll() {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);
}

/**
 * The barista's part of the handoff: hold the button, then (if the shop uses a PIN) type the PIN.
 * `send` makes the API call; a wrong PIN keeps the keypad open so the barista can try again.
 */
function BaristaApproval({
  requirePin,
  variant,
  holdLabel,
  busyLabel,
  backLabel,
  send,
  onDone,
  onBack,
  onError,
}: {
  requirePin: boolean;
  variant: "stamp" | "reward";
  holdLabel: string;
  busyLabel: string;
  backLabel: string;
  send: (pin?: string) => Promise<OrderResult>;
  onDone: (r: OrderResult) => void;
  onBack: () => void;
  onError?: (err: unknown) => void;
}) {
  const [step, setStep] = useState<"hold" | "pin">("hold");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pinError, setPinError] = useState<string | null>(null);

  const run = async (pin?: string) => {
    setBusy(true);
    setError(null);
    setPinError(null);
    try {
      onDone(await send(pin));
    } catch (err) {
      setBusy(false);
      const code = err instanceof ApiError ? err.code : undefined;
      if (code === "wrong_pin") {
        setPinError(errorMessage(err));
        return;
      }
      if (code === "pin_required") {
        // The shop turned the PIN on after this page loaded.
        setStep("pin");
        return;
      }
      setStep("hold");
      setError(errorMessage(err));
      onError?.(err);
    }
  };

  return (
    <>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="handoff-hold">
        {step === "hold" ? (
          <>
            <HoldButton
              label={holdLabel}
              busyLabel={busyLabel}
              busy={busy}
              variant={variant}
              onComplete={() => (requirePin ? setStep("pin") : void run())}
            />
            <p className="small">
              {requirePin
                ? "Barista: hold until the ring fills, then enter your PIN."
                : "Barista: press and hold until the ring fills."}
            </p>
          </>
        ) : (
          <PinPad
            busy={busy}
            error={pinError}
            variant={variant}
            onSubmit={(pin) => void run(pin)}
            onCancel={() => {
              setStep("hold");
              setPinError(null);
            }}
          />
        )}
        <button className="link-btn" onClick={onBack} disabled={busy}>
          {backLabel}
        </button>
      </div>
    </>
  );
}

function Handoff({
  shop,
  card,
  lines,
  choice,
  token,
  onBack,
  onDone,
  onMenuChanged,
}: {
  shop: PublicShop;
  card: CardView;
  lines: OrderLine[];
  choice: OrderChoice;
  token: string;
  onBack: () => void;
  onDone: (r: OrderResult) => void;
  onMenuChanged: (v: CardView) => void;
}) {
  useLockScroll();
  const { promo, promoLine, freeLine } = choice;
  const total = lines.reduce((s, l) => s + l.qty * l.unitCents, 0) - choiceOff(choice);
  const stampItems = lines.reduce((s, l) => s + (l.item.earnsStamp ? l.qty : 0), 0);
  const earns = shop.stampMode === "per_cup" ? stampItems : stampItems > 0 ? 1 : 0;
  const who = card.card.nickname ? `${card.card.nickname}, card ${card.card.code}` : `Card ${card.card.code}`;

  const send = (pin?: string) =>
    api<OrderResult>("/api/card/orders", {
      method: "POST",
      body: {
        items: apiLines(lines),
        promo: promo ? apiRef(promoLine) : undefined,
        reward: freeLine ? apiRef(freeLine) : undefined,
        pin,
      },
      cardToken: token,
    });

  return (
    <div
      className={`handoff ${freeLine ? "handoff--reward" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-label="Order for the barista"
    >
      <div className="handoff-inner">
        <p className="handoff-hint">Show this screen to the barista</p>
        <ul className="handoff-lines">
          {lines.map((l) => (
            <li key={l.key}>
              <span>
                <span className="qty">{l.qty}×</span>
                {l.name}
              </span>
              <span className="price">{peso(l.qty * l.unitCents)}</span>
            </li>
          ))}
          {promo && (
            <li className="handoff-promo">
              <span>
                {promo.label}
                {promoLine ? `: ${promoLine.name}` : ""}
              </span>
              <span className="price">
                {promoLine ? `−${peso(promoDiscount(promoLine.unitCents, promo.percentOff))}` : "Give by hand"}
              </span>
            </li>
          )}
          {freeLine && (
            <li className="handoff-promo">
              <span>Free: {freeLine.name}</span>
              <span className="price">−{peso(freeLine.unitCents)}</span>
            </li>
          )}
        </ul>
        <div className="handoff-total">
          <span>Total</span>
          <span className="tnum">{peso(total)}</span>
        </div>
        <p className="handoff-who">{who}</p>
        {freeLine ? (
          <span className="handoff-earn">Free box used. The card starts over.</span>
        ) : (
          earns > 0 && <span className="handoff-earn">Earns {plural(earns, "stamp", "stamps")}</span>
        )}
        <BaristaApproval
          requirePin={shop.requirePin}
          variant={freeLine ? "reward" : "stamp"}
          holdLabel="Hold to stamp"
          busyLabel="Stamping…"
          backLabel="Change order"
          send={send}
          onDone={onDone}
          onBack={onBack}
          onError={(err) => {
            if (err instanceof ApiError && ["menu_changed", "promo_used", "no_promo", "reward_used", "no_reward"].includes(err.code ?? "")) {
              api<CardView>("/api/card", { cardToken: token }).then(onMenuChanged, () => {});
            }
          }}
        />
      </div>
    </div>
  );
}

/* ---------------- Done ---------------- */

function Done({
  result,
  freeItem,
  promo,
  onClose,
}: {
  result: OrderResult;
  /** Name of the item that was free, when the order used the free box. */
  freeItem?: string;
  promo?: Promo;
  onClose: () => void;
}) {
  const { shop, card } = result;
  const required = shop.stampsRequired;
  const heading = freeItem
    ? `Enjoy your free ${freeItem}`
    : result.stampsAdded > 0
      ? `+${plural(result.stampsAdded, "stamp", "stamps")}`
      : "Order saved";
  const fresh = Math.min(result.stampsAdded, card.stamps, required - 1);
  const left = required - 1 - card.stamps;

  return (
    <main className="phone">
      <h1 className="shop-title" style={{ marginBottom: 6 }} aria-live="polite">
        {heading}
      </h1>
      <p className="muted" style={{ marginBottom: 20 }}>
        Saved today at {timeOf(result.approvedAt, shop.timezone)}
      </p>
      <StampCard
        shopName={card.nickname ? `${card.nickname}'s card` : shop.name}
        code={card.code}
        required={shop.stampsRequired}
        stamps={card.stamps}
        stampDates={result.stampDates}
        rewardText={shop.rewardText}
        timezone={shop.timezone}
        fresh={fresh}
        logoUrl={shop.logoUrl}
        promos={shop.promos}
      />
      {promo && (
        <p className="form-note" style={{ marginTop: 16 }}>
          {result.discountCents > 0
            ? `You saved ${peso(result.discountCents)} with your ${promo.label}.`
            : `Your ${promo.label} was used. Enjoy!`}
        </p>
      )}
      {result.limitNote && (
        <p className="form-note" style={{ marginTop: 16 }}>
          {result.limitNote}
        </p>
      )}
      <p className="card-status">
        {left <= 0
          ? `Your ${rewardName(shop.rewardText)} is next!`
          : freeItem
            ? `Your card starts over${card.stamps > 0 ? ` with ${plural(card.stamps, "stamp", "stamps")}` : ""}. ${left} more, then the next one is free.`
            : `${left} more, then the next one is free.`}
      </p>
      <div className="dock">
        <div className="dock-inner">
          <button className="btn btn--big btn--block" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </main>
  );
}
