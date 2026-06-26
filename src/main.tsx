import React from "react";
import ReactDOM from "react-dom/client";

import App from "./App";
import "./styles/dashboard.css";

import { NotificationProvider } from "./providers/NotificationProvider";

ReactDOM.createRoot(
  document.getElementById("root")!
).render(
  <React.StrictMode>
    <NotificationProvider>
      <App />
    </NotificationProvider>
  </React.StrictMode>
);
