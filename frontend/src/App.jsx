// src/App.jsx
import React, { useState } from "react";
import { useAuth } from "./context/AuthContext.jsx";
import { Auth } from "./pages/Auth.jsx";
import { Navbar } from "./components/Navbar.jsx";
import { Dashboard } from "./pages/Dashboard.jsx";
import { Market } from "./pages/Market.jsx";
import { Holdings } from "./pages/Holdings.jsx";
import { Orders } from "./pages/Orders.jsx";
import { OrderModal } from "./components/OrderModal.jsx";
import { StockDetailModal } from "./components/StockDetailModal.jsx";

export const App = () => {
  const { isAuthenticated, loading, refreshUser } = useAuth();
  const [activeTab, setActiveTab] = useState("dashboard");

  // Two-step flow:
  //   1. Click stock row  → StockDetailModal opens (shows chart + info)
  //   2. Click Buy / Sell → StockDetailModal closes, OrderModal opens
  const [detailStock,  setDetailStock]  = useState(null); // stock for chart modal
  const [orderStock,   setOrderStock]   = useState(null); // stock for order placement

  const handleSelectStock = (stock) => {
    setDetailStock(stock);
  };

  const handleTrade = (stock) => {
    setDetailStock(null);
    setOrderStock(stock);
  };

  if (loading) {
    return (
      <div style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "var(--bg-dark)",
        color: "var(--text-muted)",
        fontSize: 16,
      }}>
        Initializing PaperBull...
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Auth />;
  }

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "var(--bg-dark)" }}>
      <Navbar activeTab={activeTab} setActiveTab={setActiveTab} />

      <main>
        {activeTab === "dashboard" && (
          <Dashboard onSelectStock={handleSelectStock} setActiveTab={setActiveTab} />
        )}
        {activeTab === "market" && (
          <Market onSelectStock={handleSelectStock} />
        )}
        {activeTab === "holdings" && (
          <Holdings onSelectStock={handleSelectStock} />
        )}
        {activeTab === "orders" && (
          <Orders />
        )}
      </main>

      {/* Step 1: Stock detail + candlestick chart modal */}
      {detailStock && (
        <StockDetailModal
          stock={detailStock}
          onClose={() => setDetailStock(null)}
          onTrade={handleTrade}
        />
      )}

      {/* Step 2: Order placement modal */}
      {orderStock && (
        <OrderModal
          stock={orderStock}
          onClose={() => setOrderStock(null)}
          onOrderPlaced={refreshUser}
        />
      )}
    </div>
  );
};

export default App;
