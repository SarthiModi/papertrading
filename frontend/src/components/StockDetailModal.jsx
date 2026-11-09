// src/components/StockDetailModal.jsx
// Groww-style stock detail panel: candlestick chart + live price + watchlist + trade.

import React, { useState, useEffect, useCallback } from "react";
import { api } from "../api/client.js";
import { useSocket } from "../context/SocketContext.jsx";
import { CandleChart } from "./CandleChart.jsx";
import { X, TrendingUp, TrendingDown, BarChart2, AlertCircle, Star } from "lucide-react";

const INTERVALS = [
  { label: "1m",  seconds: 60,   limit: 60 },
  { label: "5m",  seconds: 300,  limit: 60 },
  { label: "15m", seconds: 900,  limit: 60 },
  { label: "1h",  seconds: 3600, limit: 48 },
];

export const StockDetailModal = ({ stock, onClose, onTrade }) => {
  const { livePrices } = useSocket();

  const [interval,   setIntervalOpt] = useState(INTERVALS[0]);
  const [candles,    setCandles]     = useState([]);
  const [loading,    setLoading]     = useState(true);
  const [error,      setError]       = useState(null);

  // ── Watchlist state ──────────────────────────────────────────────────────
  const [isWatched,      setIsWatched]      = useState(false);
  const [watchlistLoading, setWatchlistLoading] = useState(false);

  // Live price from Socket.IO
  const liveData   = livePrices[stock.id];
  const livePrice  = liveData?.price         || Number(stock.current_price);
  const changePct  = liveData?.changePercent || 0;
  const isPositive = changePct >= 0;

  // ── Check watchlist status on mount ─────────────────────────────────────
  useEffect(() => {
    const checkWatchlist = async () => {
      try {
        const list = await api.get("/watchlist");
        const ids  = new Set((list || []).map(w => w.stock_id));
        setIsWatched(ids.has(stock.id));
      } catch (_) {
        // Not authenticated or error — silently ignore, star stays grey
      }
    };
    checkWatchlist();
  }, [stock.id]);

  // ── Watchlist toggle ─────────────────────────────────────────────────────
  const toggleWatchlist = async () => {
    setWatchlistLoading(true);
    try {
      if (isWatched) {  //delete watchlist id
        await api.delete(`/watchlist/${stock.id}`);
        setIsWatched(false);
      } else {    //delete watchlist symbol
        await api.post("/watchlist", { symbol: stock.symbol });
        setIsWatched(true);
      }
    } catch (err) {   // watchlist toggle failed
      console.error("Watchlist toggle failed:", err.message);
    } finally {
      setWatchlistLoading(false);
    }
  };

  // ── Fetch candle data ────────────────────────────────────────────────────
  const fetchCandles = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get(
        `/stocks/${stock.id}/candles?interval=${interval.seconds}&limit=${interval.limit}`
      );
      setCandles(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("[StockDetailModal] Failed to fetch candles:", err);
      setError(err.message);
      setCandles([]);
    } finally {
      setLoading(false);
    }
  }, [stock.id, interval]);

  useEffect(() => { fetchCandles(); }, [fetchCandles]);

  // Auto-refresh candles every 15 seconds
  useEffect(() => {
    const timer = setInterval(fetchCandles, 15000);
    return () => clearInterval(timer);
  }, [fetchCandles]);

  // Close on Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 200,
        backgroundColor: "rgba(0,0,0,0.65)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 20,
        backdropFilter: "blur(4px)",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: 820,
          backgroundColor: "var(--bg-card)",
          border: "1px solid var(--border)",
          borderRadius: 16,
          overflow: "hidden",
          boxShadow: "0 24px 80px rgba(0,0,0,0.5)",
        }}
      >
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div style={{
          display: "flex", alignItems: "flex-start", gap: 12,
          padding: "20px 24px 16px",
          borderBottom: "1px solid var(--border)",
        }}>
          {/* Stock info */}
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
              <BarChart2 size={18} color="var(--blue)" />
              <span style={{ fontSize: 20, fontWeight: 800 }}>{stock.symbol}</span>
              <span style={{
                fontSize: 11, fontWeight: 600, color: "var(--text-subtle)",
                backgroundColor: "var(--bg-card-hover)", padding: "2px 7px", borderRadius: 4,
              }}>NSE</span>
            </div>
            <div style={{ fontSize: 13, color: "var(--text-muted)" }}>{stock.company_name}</div>
          </div>

          {/* Live price + change */}
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 26, fontWeight: 800, fontVariantNumeric: "tabular-nums", marginBottom: 6 }}>
              ₹{livePrice.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
            </div>
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 4,
              padding: "3px 10px", borderRadius: 6, fontSize: 13, fontWeight: 700,
              backgroundColor: isPositive ? "var(--green-bg)" : "var(--red-bg)",
              color: isPositive ? "var(--green)" : "var(--red)",
            }}>
              {isPositive ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
              {isPositive ? "+" : ""}{changePct.toFixed(2)}%
            </div>
          </div>

          {/* ── Watchlist star button ────────────────────────────────────── */}
          <button
            onClick={toggleWatchlist}
            disabled={watchlistLoading}
            title={isWatched ? "Remove from watchlist" : "Add to watchlist"}
            style={{
              padding: 8,
              borderRadius: 8,
              backgroundColor: isWatched ? "rgba(234,179,8,0.12)" : "var(--bg-card-hover)",
              color: isWatched ? "#eab308" : "var(--text-muted)",
              transition: "all 0.15s ease",
              opacity: watchlistLoading ? 0.5 : 1,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            <Star
              size={20}
              fill={isWatched ? "#eab308" : "none"}
              stroke={isWatched ? "#eab308" : "currentColor"}
            />
          </button>

          {/* Close button */}
          <button
            onClick={onClose}
            style={{
              padding: 8, borderRadius: 8,
              backgroundColor: "var(--bg-card-hover)", color: "var(--text-muted)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Watchlist status toast */}
        {isWatched && (
          <div style={{
            padding: "8px 24px",
            backgroundColor: "rgba(234,179,8,0.08)",
            borderBottom: "1px solid rgba(234,179,8,0.15)",
            fontSize: 12,
            color: "#eab308",
            display: "flex", alignItems: "center", gap: 6,
          }}>
            <Star size={12} fill="#eab308" />
            {stock.symbol} is in your watchlist
          </div>
        )}

        {/* ── Interval tabs ─────────────────────────────────────────────── */}
        <div style={{ display: "flex", gap: 4, padding: "12px 24px 0" }}>
          {INTERVALS.map((iv) => (
            <button
              key={iv.label}
              onClick={() => setIntervalOpt(iv)}
              style={{
                padding: "5px 14px", borderRadius: 6, fontSize: 12, fontWeight: 600,
                backgroundColor: interval.label === iv.label ? "var(--blue)" : "var(--bg-card-hover)",
                color: interval.label === iv.label ? "#fff" : "var(--text-muted)",
              }}
            >
              {iv.label}
            </button>
          ))}
          <div style={{
            marginLeft: "auto", display: "flex", alignItems: "center",
            gap: 6, fontSize: 11, color: "var(--text-subtle)",
          }}>
            <span style={{
              width: 7, height: 7, borderRadius: "50%",
              backgroundColor: "var(--green)", boxShadow: "0 0 5px var(--green)",
              display: "inline-block",
            }} />
            Live
          </div>
        </div>

        {/* ── Chart ────────────────────────────────────────────────────── */}
        <div style={{ padding: "12px 24px 0", minHeight: 340 }}>
          {loading ? (
            <div style={{
              height: 320, display: "flex", alignItems: "center", justifyContent: "center",
              color: "var(--text-subtle)", fontSize: 13, gap: 10,
            }}>
              <div style={{
                width: 18, height: 18, border: "2px solid var(--border)",
                borderTopColor: "var(--blue)", borderRadius: "50%",
                animation: "spin 0.8s linear infinite",
              }} />
              Loading {interval.label} candles...
            </div>
          ) : error ? (
            <div style={{
              height: 320, display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center", gap: 10,
              color: "var(--red)", fontSize: 13,
            }}>
              <AlertCircle size={28} />
              <div>Failed to load chart</div>
              <div style={{ fontSize: 11, color: "var(--text-subtle)", maxWidth: 400, textAlign: "center" }}>
                {error}
              </div>
              <button
                onClick={fetchCandles}
                style={{
                  marginTop: 8, padding: "6px 16px", borderRadius: 6,
                  backgroundColor: "var(--bg-card-hover)", color: "var(--text-main)",
                  fontSize: 12, fontWeight: 600,
                }}
              >
                Retry
              </button>
            </div>
          ) : candles.length === 0 ? (
            <div style={{
              height: 320, display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center", gap: 8,
              color: "var(--text-subtle)", fontSize: 13,
            }}>
              <BarChart2 size={32} style={{ opacity: 0.3 }} />
              <div>No candle data yet</div>
              <div style={{ fontSize: 11, maxWidth: 300, textAlign: "center" }}>
                Price engine is running — data appears after a few ticks. Try <strong>1m</strong>.
              </div>
            </div>
          ) : (
            <CandleChart candles={candles} livePrice={livePrice} height={320} />
          )}
        </div>

        {/* ── OHLC stats bar ────────────────────────────────────────────── */}
        {candles.length > 0 && (() => {
          const last = candles[candles.length - 1];
          return (
            <div style={{
              display: "flex", gap: 24, padding: "12px 24px",
              fontSize: 12, color: "var(--text-muted)", flexWrap: "wrap",
            }}>
              {[["O", last.open], ["H", last.high], ["L", last.low], ["C", last.close]].map(([label, val]) => (
                <span key={label}>
                  <span style={{ color: "var(--text-subtle)", marginRight: 4 }}>{label}</span>
                  <span style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums", color: "var(--text-main)" }}>
                    ₹{Number(val).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </span>
                </span>
              ))}
              <span style={{ marginLeft: "auto", color: "var(--text-subtle)" }}>
                {candles.length} candles · {interval.label}
              </span>
            </div>
          );
        })()}

        {/* ── Footer: Buy / Sell / Watchlist ───────────────────────────── */}
        <div style={{
          display: "flex", gap: 10, padding: "16px 24px",
          borderTop: "1px solid var(--border)",
          backgroundColor: "var(--bg-card-hover)",
          alignItems: "center",
        }}>
          {/* Add to Watchlist button */}
          <button
            onClick={toggleWatchlist}
            disabled={watchlistLoading}
            style={{
              padding: "12px 18px",
              borderRadius: 10, fontSize: 14, fontWeight: 700,
              backgroundColor: isWatched ? "rgba(234,179,8,0.15)" : "var(--bg-card)",
              color: isWatched ? "#eab308" : "var(--text-muted)",
              border: `1px solid ${isWatched ? "rgba(234,179,8,0.4)" : "var(--border)"}`,
              display: "flex", alignItems: "center", gap: 7,
              transition: "all 0.15s ease",
              opacity: watchlistLoading ? 0.6 : 1,
              whiteSpace: "nowrap",
            }}
          >
            <Star size={16} fill={isWatched ? "#eab308" : "none"} stroke={isWatched ? "#eab308" : "currentColor"} />
            {isWatched ? "Watching" : "Watchlist"}
          </button>

          <button
            onClick={() => { onTrade(stock, "BUY"); onClose(); }}
            style={{
              flex: 1, padding: "12px 0", borderRadius: 10,
              fontSize: 15, fontWeight: 700,
              backgroundColor: "var(--green)", color: "#fff",
            }}
          >
            Buy {stock.symbol}
          </button>
          <button
            onClick={() => { onTrade(stock, "SELL"); onClose(); }}
            style={{
              flex: 1, padding: "12px 0", borderRadius: 10,
              fontSize: 15, fontWeight: 700,
              backgroundColor: "var(--red)", color: "#fff",
            }}
          >
            Sell {stock.symbol}
          </button>
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
};
