import React from "react";
import "./LoadingSpinner.css";

const LoadingSpinner = ({ message = "Loading", size = "default" }) => (
  <div className={`loading-spinner-container ${size}`}>
    <div className="loading-spinner-ring">
      <div className="loading-spinner-circle"></div>
    </div>
    {message && <span className="loading-spinner-text">{message}</span>}
  </div>
);

export default LoadingSpinner;