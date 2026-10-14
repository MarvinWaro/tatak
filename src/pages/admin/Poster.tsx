import QRCode from "qrcode";
import { useEffect, useState } from "react";
import type { ShopSettings } from "../../../shared/types";
import { Icon } from "../../components/Icon";
import { Link } from "../../lib/router";
import { useApi } from "../../lib/useApi";

/** A printable poster with the shop's QR code. Tape it to the cart. */
export function Poster() {
  const { data: shop, error } = useApi<ShopSettings>("/api/admin/me");
  const [svg, setSvg] = useState<string | null>(null);
  const link = shop ? `${location.origin}/s/${shop.slug}` : "";

  useEffect(() => {
    if (!link) return;
    QRCode.toString(link, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#2a1b14", light: "#ffffff" } })
      .then(setSvg)
      .catch(() => setSvg(null));
  }, [link]);

  useEffect(() => {
    if (shop) document.title = `QR poster | ${shop.name}`;
  }, [shop]);

  if (error) return <p className="form-error">{error}</p>;
  if (!shop) return <div className="skeleton" style={{ height: 400, margin: 24 }} />;

  const unit = shop.stampMode === "per_cup" ? "cup" : "order";

  return (
    <div className="poster">
      <div className="row no-print" style={{ marginBottom: 16 }}>
        <Link to="/admin/settings" className="btn btn--ghost btn--sm">
          <Icon name="back" /> Back to settings
        </Link>
        <button className="btn btn--sm" onClick={() => window.print()}>
          <Icon name="print" /> Print poster
        </button>
      </div>
      <div className="poster-sheet">
        <h1 className="poster-shop">{shop.name}</h1>
        <p className="poster-call">Scan for your stamp card</p>
        <div className="poster-qr" role="img" aria-label={`QR code for ${link}`}>
          {svg ? <div dangerouslySetInnerHTML={{ __html: svg }} /> : <div className="skeleton" style={{ aspectRatio: "1" }} />}
        </div>
        <p className="poster-rules">
          Order on your phone and get a stamp for every {unit}. {shop.stampsRequired} stamps = {shop.rewardText}.
        </p>
        <p className="poster-url">{link}</p>
      </div>
    </div>
  );
}
