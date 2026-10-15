import type { CSSProperties } from "react";
import { PLATFORM_TIMEZONE as TZ, SUPER_RECENT_DAYS, type SuperShop } from "../../../shared/types";
import { Icon } from "../../components/Icon";
import { dateOf, peso, plural, whenOf } from "../../lib/format";
import { Link } from "../../lib/router";
import { useShops } from "./SuperLayout";

export function Shops() {
  const shops = useShops();

  if (shops.length === 0) {
    return (
      <section className="panel empty">
        <h1 className="page-title" style={{ marginBottom: 0 }}>
          No shops yet
        </h1>
        <p>Shops show up here as soon as someone signs up.</p>
      </section>
    );
  }

  let customers = 0;
  let paidOrders = 0;
  let salesCents = 0;
  for (const s of shops) {
    customers += s.customers;
    paidOrders += s.recentPaidOrders;
    salesCents += s.recentSalesCents;
  }

  return (
    <div className="stack" style={{ "--gap": "20px" } as CSSProperties}>
      <section>
        <h1 className="headline">
          {plural(shops.length, "shop", "shops")} with {plural(customers, "customer card", "customer cards")}.
        </h1>
        <p className="subline">
          In the last {SUPER_RECENT_DAYS} days: {peso(salesCents)} across{" "}
          {plural(paidOrders, "paid order", "paid orders")}.
        </p>
      </section>
      <ul className="panel panel--flush divided" style={{ listStyle: "none", margin: 0 }}>
        {shops.map((s) => (
          <ShopRow key={s.id} shop={s} />
        ))}
      </ul>
    </div>
  );
}

function ShopRow({ shop }: { shop: SuperShop }) {
  return (
    <li className="shop-row">
      <div className="shop-row-main">
        <h2 className="shop-row-name">
          {shop.name} {shop.menuItems === 0 && <span className="tag tag--grey">No menu yet</span>}
        </h2>
        <div className="small">{shop.email}</div>
        <div className="small muted">
          Joined {dateOf(shop.createdAt, TZ)}. {plural(shop.customers, "customer", "customers")}.
        </div>
        <div className="small muted">
          {shop.lastOrderAt ? `Last order: ${whenOf(shop.lastOrderAt, TZ)}` : "No orders yet"}
        </div>
      </div>
      <div className="list-amount">
        {peso(shop.recentSalesCents)}
        <div className="xsmall muted">
          {plural(shop.recentPaidOrders, "order", "orders")} in {SUPER_RECENT_DAYS} days
        </div>
      </div>
      <div className="shop-row-actions">
        <Link className="btn btn--sm" to={`/super/transactions?shop=${shop.id}`}>
          <Icon name="receipt" /> See transactions
        </Link>
        <a
          className="btn btn--ghost btn--sm"
          href={`/s/${shop.slug}`}
          target="_blank"
          rel="noreferrer"
          aria-label={`Open the customer page of ${shop.name}`}
        >
          <Icon name="external" /> Customer page
        </a>
      </div>
    </li>
  );
}
