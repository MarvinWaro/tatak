import { type CSSProperties, useEffect, useState } from "react";
import type { CardCreated, CardView, OrderResult, PublicMenuItem, PublicShop } from "../../shared/types";
import { HoldButton } from "../components/HoldButton";
import { Icon } from "../components/Icon";
import { PinPad } from "../components/PinPad";
import { StampCard } from "../components/StampCard";
import { ApiError, api, errorMessage } from "../lib/api";
import { itemsText, peso, plural, timeOf, whenOf } from "../lib/format";
import { backupSeenKey, cardKey, readItem, removeItem, writeItem } from "../lib/storage";

type View =
  | { kind: "card" }
  | { kind: "order" }
  | { kind: "handoff" }
  | { kind: "reward-pick" }
  | { kind: "reward-handoff"; item: PublicMenuItem }
  | { kind: "done"; result: OrderResult; rewardItem?: string };

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
  const [qty, setQty] = useState<Record<string, number>>({});

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

  switch (view.kind) {
    case "order":
      return (
        <OrderPicker
          shop={cardView.shop}
          qty={qty}
          setQty={setQty}
          onBack={() => setView({ kind: "card" })}
          onNext={() => setView({ kind: "handoff" })}
        />
      );
    case "handoff":
      return (
        <Handoff
          shop={cardView.shop}
          card={cardView}
          lines={menu.filter((m) => qty[m.id] > 0).map((m) => ({ item: m, qty: qty[m.id] }))}
          token={token}
          onBack={() => setView({ kind: "order" })}
          onMenuChanged={update}
          onDone={(result) => {
            update(result);
            setQty({});
            setView({ kind: "done", result });
          }}
        />
      );
    case "reward-pick":
      return (
        <RewardPicker
          shop={cardView.shop}
          onBack={() => setView({ kind: "card" })}
          onPick={(item) => setView({ kind: "reward-handoff", item })}
        />
      );
    case "reward-handoff":
      return (
        <RewardHandoff
          shop={cardView.shop}
          card={cardView}
          item={view.item}
          token={token}
          onBack={() => setView({ kind: "reward-pick" })}
          onDone={(result) => {
            update(result);
            setView({ kind: "done", result, rewardItem: view.item.name });
          }}
        />
      );
    case "done":
      return <Done result={view.result} rewardItem={view.rewardItem} onClose={() => setView({ kind: "card" })} />;
    default:
      return (
        <CardHome
          slug={slug}
          view={cardView}
          token={token}
          onUpdate={update}
          onOrder={() => setView({ kind: "order" })}
          onReward={() => setView({ kind: "reward-pick" })}
        />
      );
  }
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
      <h1 className="shop-title">{shop.name}</h1>
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
              placeholder="XXXX-XXXX-XXXX-XXXX"
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
  onReward,
}: {
  slug: string;
  view: CardView;
  token: string;
  onUpdate: (v: CardView) => void;
  onOrder: () => void;
  onReward: () => void;
}) {
  const { shop, card } = view;
  const [showBackup, setShowBackup] = useState(false);
  const [backupSeen, setBackupSeen] = useState(() => readItem(backupSeenKey(slug)) === "1");
  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState(card.nickname ?? "");
  const [nameError, setNameError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const filled = Math.min(card.stamps, shop.stampsRequired);
  const rewardReady = card.stamps >= shop.stampsRequired;
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
  else if (rewardReady) status = `Your ${rewardName(shop.rewardText)} is ready.`;
  else if (filled === 0) status = `Collect ${shop.stampsRequired} stamps for ${shop.rewardText}.`;
  else {
    const left = shop.stampsRequired - filled;
    status = `${filled} of ${shop.stampsRequired} stamps. ${plural(left, "more stamp", "more stamps")} for ${shop.rewardText}.`;
  }

  return (
    <main className="phone">
      <h1 className="shop-title" style={{ marginBottom: 20 }}>
        {shop.name}
      </h1>
      <StampCard
        shopName={card.nickname ? `${card.nickname}'s card` : shop.name}
        code={card.code}
        required={shop.stampsRequired}
        stamps={card.stamps}
        stampDates={view.stampDates}
        rewardText={shop.rewardText}
        timezone={shop.timezone}
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
                  {h.isReward ? `Free: ${itemsText(h.items)}` : itemsText(h.items)}
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
                  {!h.isReward && h.status !== "voided" && h.stampsAwarded > 0 ? `, ${peso(h.totalCents)}` : ""}
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
            {rewardReady && (
              <button className="btn btn--big btn--block btn--bond" onClick={onReward} disabled={!hasMenu}>
                Use my {rewardName(shop.rewardText)}
              </button>
            )}
            <button
              className={`btn btn--big btn--block ${rewardReady ? "btn--ghost" : ""}`}
              onClick={onOrder}
              disabled={!hasMenu}
            >
              Order
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
  onBack,
  onNext,
}: {
  shop: PublicShop;
  qty: Record<string, number>;
  setQty: (q: Record<string, number>) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const count = Object.values(qty).reduce((a, b) => a + b, 0);
  const total = shop.menu.reduce((sum, m) => sum + (qty[m.id] ?? 0) * m.priceCents, 0);
  const change = (id: string, delta: number) => {
    const next = Math.max(0, Math.min(20, (qty[id] ?? 0) + delta));
    setQty({ ...qty, [id]: next });
  };

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
      <ul className="menu-list panel panel--flush">
        {shop.menu.map((m) => {
          const n = qty[m.id] ?? 0;
          return (
            <li key={m.id} className={`menu-row ${n > 0 ? "menu-row--picked" : ""}`}>
              <div>
                <div className="menu-name">{m.name}</div>
                <div className="menu-meta">
                  {peso(m.priceCents)}
                  {!m.earnsStamp && ", no stamp"}
                </div>
              </div>
              <div className="stepper" role="group" aria-label={`${m.name} quantity`}>
                {n > 0 && (
                  <>
                    <button type="button" onClick={() => change(m.id, -1)} aria-label={`Remove one ${m.name}`}>
                      <Icon name="minus" />
                    </button>
                    <output aria-live="polite">{n}</output>
                  </>
                )}
                <button
                  type="button"
                  className="plus"
                  onClick={() => change(m.id, 1)}
                  disabled={n >= 20}
                  aria-label={`Add one ${m.name}`}
                >
                  <Icon name="plus" />
                </button>
              </div>
            </li>
          );
        })}
      </ul>
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
  token,
  onBack,
  onDone,
  onMenuChanged,
}: {
  shop: PublicShop;
  card: CardView;
  lines: { item: PublicMenuItem; qty: number }[];
  token: string;
  onBack: () => void;
  onDone: (r: OrderResult) => void;
  onMenuChanged: (v: CardView) => void;
}) {
  useLockScroll();
  const total = lines.reduce((s, l) => s + l.qty * l.item.priceCents, 0);
  const stampItems = lines.reduce((s, l) => s + (l.item.earnsStamp ? l.qty : 0), 0);
  const earns = shop.stampMode === "per_cup" ? stampItems : stampItems > 0 ? 1 : 0;
  const who = card.card.nickname ? `${card.card.nickname}, card ${card.card.code}` : `Card ${card.card.code}`;

  const send = (pin?: string) =>
    api<OrderResult>("/api/card/orders", {
      method: "POST",
      body: { items: lines.map((l) => ({ id: l.item.id, qty: l.qty })), pin },
      cardToken: token,
    });

  return (
    <div className="handoff" role="dialog" aria-modal="true" aria-label="Order for the barista">
      <div className="handoff-inner">
        <p className="handoff-hint">Show this screen to the barista</p>
        <ul className="handoff-lines">
          {lines.map((l) => (
            <li key={l.item.id}>
              <span>
                <span className="qty">{l.qty}×</span>
                {l.item.name}
              </span>
              <span className="price">{peso(l.qty * l.item.priceCents)}</span>
            </li>
          ))}
        </ul>
        <div className="handoff-total">
          <span>Total</span>
          <span className="tnum">{peso(total)}</span>
        </div>
        <p className="handoff-who">{who}</p>
        {earns > 0 && <span className="handoff-earn">Earns {plural(earns, "stamp", "stamps")}</span>}
        <BaristaApproval
          requirePin={shop.requirePin}
          variant="stamp"
          holdLabel="Hold to stamp"
          busyLabel="Stamping…"
          backLabel="Change order"
          send={send}
          onDone={onDone}
          onBack={onBack}
          onError={(err) => {
            if (err instanceof ApiError && err.code === "menu_changed") {
              api<CardView>("/api/card", { cardToken: token }).then(onMenuChanged, () => {});
            }
          }}
        />
      </div>
    </div>
  );
}

/* ---------------- Reward ---------------- */

function RewardPicker({
  shop,
  onBack,
  onPick,
}: {
  shop: PublicShop;
  onBack: () => void;
  onPick: (item: PublicMenuItem) => void;
}) {
  const drinks = shop.menu.filter((m) => m.earnsStamp);
  const [picked, setPicked] = useState<string | null>(null);
  const item = drinks.find((d) => d.id === picked);

  return (
    <main className="phone">
      <div className="row" style={{ marginBottom: 12, marginLeft: -10 }}>
        <button className="icon-btn" onClick={onBack} aria-label="Back to my card">
          <Icon name="back" />
        </button>
        <span className="muted">{shop.name}</span>
      </div>
      <h1 className="shop-title" style={{ marginBottom: 8 }}>
        Pick your free drink
      </h1>
      <p className="muted" style={{ marginBottom: 20 }}>
        This uses {shop.stampsRequired} stamps from your card.
      </p>
      <fieldset className="panel panel--flush" style={{ border: 0, margin: 0 }}>
        <legend className="sr-only">Free drink</legend>
        {drinks.map((d) => (
          <label key={d.id} className="pick">
            <input type="radio" name="reward" checked={picked === d.id} onChange={() => setPicked(d.id)} />
            <span className="menu-name">{d.name}</span>
          </label>
        ))}
      </fieldset>
      <div className="dock">
        <div className="dock-inner">
          <button className="btn btn--big btn--block btn--bond" disabled={!item} onClick={() => item && onPick(item)}>
            {item ? `Show barista: free ${item.name}` : "Pick a drink"}
          </button>
        </div>
      </div>
    </main>
  );
}

function RewardHandoff({
  shop,
  card,
  item,
  token,
  onBack,
  onDone,
}: {
  shop: PublicShop;
  card: CardView;
  item: PublicMenuItem;
  token: string;
  onBack: () => void;
  onDone: (r: OrderResult) => void;
}) {
  useLockScroll();
  const who = card.card.nickname ? `${card.card.nickname}, card ${card.card.code}` : `Card ${card.card.code}`;
  const send = (pin?: string) =>
    api<OrderResult>("/api/card/redeem", { method: "POST", body: { itemId: item.id, pin }, cardToken: token });

  return (
    <div className="handoff handoff--reward" role="dialog" aria-modal="true" aria-label="Free drink for the barista">
      <div className="handoff-inner">
        <p className="handoff-hint">Show this screen to the barista</p>
        <p className="handoff-total" style={{ display: "block" }}>
          Free {item.name}
        </p>
        <p className="handoff-who">
          For {who}. Uses {shop.stampsRequired} of {card.card.stamps} stamps.
        </p>
        <BaristaApproval
          requirePin={shop.requirePin}
          variant="reward"
          holdLabel="Hold to give"
          busyLabel="Saving…"
          backLabel="Pick another drink"
          send={send}
          onDone={onDone}
          onBack={onBack}
        />
      </div>
    </div>
  );
}

/* ---------------- Done ---------------- */

function Done({ result, rewardItem, onClose }: { result: OrderResult; rewardItem?: string; onClose: () => void }) {
  const { shop, card } = result;
  const heading = rewardItem
    ? `Enjoy your free ${rewardItem}`
    : result.stampsAdded > 0
      ? `+${plural(result.stampsAdded, "stamp", "stamps")}`
      : "Order saved";
  const fresh = Math.min(result.stampsAdded, card.stamps, shop.stampsRequired);

  return (
    <main className="phone">
      <h1 className="shop-title" style={{ marginBottom: 6 }} aria-live="polite">
        {heading}
      </h1>
      <p className="muted" style={{ marginBottom: 20 }}>
        {rewardItem ? "Given" : "Saved"} today at {timeOf(result.approvedAt, shop.timezone)}
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
      />
      {result.limitNote && (
        <p className="form-note" style={{ marginTop: 16 }}>
          {result.limitNote}
        </p>
      )}
      <p className="card-status">
        {card.stamps >= shop.stampsRequired
          ? `Your ${rewardName(shop.rewardText)} is ready for your next visit.`
          : rewardItem && card.stamps === 0
            ? `Your card starts over. Collect ${shop.stampsRequired} stamps for another ${rewardName(shop.rewardText)}.`
            : `${plural(shop.stampsRequired - card.stamps, "more stamp", "more stamps")} for ${shop.rewardText}.`}
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
