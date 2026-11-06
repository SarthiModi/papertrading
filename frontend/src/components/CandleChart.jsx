// src/components/CandleChart.jsx
// Candlestick (OHLC) chart using lightweight-charts v5 by TradingView.
//
// BREAKING CHANGE in v5:
//   v4: chart.addCandlestickSeries({ ... })
//   v5: chart.addSeries(CandlestickSeries, { ... })
//
// v5 also exports individual series types as named exports instead of
// methods on the chart object. We import CandlestickSeries directly.

import React, { useEffect, useRef } from "react";
import { createChart, CandlestickSeries } from "lightweight-charts";

export const CandleChart = ({ candles, livePrice, height = 320 }) => {
  const containerRef = useRef(null);
  const chartRef     = useRef(null);
  const seriesRef    = useRef(null);

  // ── Mount chart on first render ─────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;

    let chart;
    try {
      chart = createChart(containerRef.current, {
        height,
        layout: {
          background:  { color: "transparent" },
          textColor:   "#64748b",
          fontFamily:  "system-ui, sans-serif",
          fontSize:    11,
        },
        grid: {
          vertLines: { color: "rgba(255,255,255,0.04)" },
          horzLines: { color: "rgba(255,255,255,0.04)" },
        },
        crosshair: {
          vertLine: { color: "rgba(255,255,255,0.2)", width: 1, style: 2, labelBackgroundColor: "#1b263b" },
          horzLine: { color: "rgba(255,255,255,0.2)", width: 1, style: 2, labelBackgroundColor: "#1b263b" },
        },
        rightPriceScale: {
          borderColor:  "rgba(255,255,255,0.08)",
          textColor:    "#64748b",
        },
        timeScale: {
          borderColor:    "rgba(255,255,255,0.08)",
          timeVisible:    true,
          secondsVisible: false,
          tickMarkFormatter: (time) => {
            const d = new Date(time * 1000);
            return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false });
          },
        },
        autoSize: true,
      });

      // v5 API: addSeries(SeriesType, options)
      const series = chart.addSeries(CandlestickSeries, {
        upColor:         "#10b981",
        downColor:       "#ef4444",
        borderUpColor:   "#10b981",
        borderDownColor: "#ef4444",
        wickUpColor:     "#10b981",
        wickDownColor:   "#ef4444",
      });

      chartRef.current  = chart;
      seriesRef.current = series;
    } catch (err) {
      console.error("[CandleChart] Failed to create chart:", err);
    }

    return () => {
      try { chart?.remove(); } catch (_) {}
      chartRef.current  = null;
      seriesRef.current = null;
    };
  }, [height]);

  // ── Load all candle data when candles prop changes ───────────────────────
  useEffect(() => {
    if (!seriesRef.current || !candles?.length) return;

    try {
      // lightweight-charts needs Unix timestamp in SECONDS (not ms)
      const formatted = candles
        .map(c => ({
          time:  Math.floor(new Date(c.time).getTime() / 1000),
          open:  Number(c.open),
          high:  Number(c.high),
          low:   Number(c.low),
          close: Number(c.close),
        }))
        // Must be sorted ascending and no duplicate times
        .sort((a, b) => a.time - b.time)
        .filter((c, i, arr) => i === 0 || c.time !== arr[i - 1].time);

      seriesRef.current.setData(formatted);
      chartRef.current?.timeScale().fitContent();
    } catch (err) {
      console.error("[CandleChart] setData error:", err);
    }
  }, [candles]);

  // ── Live price synchronization with the latest market tick ──────────────
// Keeps the displayed candle aligned with incoming price updates.
useEffect(() => {
    if (!seriesRef.current || !candles?.length || !livePrice) return;

    try {
      const lastCandle = candles[candles.length - 1];
      if (!lastCandle) return;

      seriesRef.current.update({
        time:  Math.floor(new Date(lastCandle.time).getTime() / 1000),
        open:  Number(lastCandle.open),
        high:  Math.max(Number(lastCandle.high), livePrice),
        low:   Math.min(Number(lastCandle.low),  livePrice),
        close: livePrice,
      });
    } catch (_) {
      // Suppress update errors (e.g. if chart was removed)
    }
  }, [livePrice]);

  return (
    <div
      ref={containerRef}
      style={{ width: "100%", height, borderRadius: 8, overflow: "hidden" }}
    />
  );
};
