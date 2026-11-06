import React, { useState, useEffect } from "react";
import { Bot, Database, Sparkles, BarChart3 } from "lucide-react";
import "./TypingIndicator.css";

const loadingMessages = [
  { text: "Analyzing your query", icon: Sparkles },
  { text: "Searching data sources", icon: Database },
  { text: "Processing results", icon: BarChart3 },
  { text: "Generating insights", icon: Sparkles },
];

const TypingIndicator = () => {
  const [messageIndex, setMessageIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setMessageIndex((prev) => (prev + 1) % loadingMessages.length);
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  const currentMessage = loadingMessages[messageIndex];
  const IconComponent = currentMessage.icon;

  return (
    <div className="typing-indicator-wrapper">
      {/* Bot Avatar */}
      <div className="typing-avatar">
        <Bot className="typing-avatar-icon" strokeWidth={2} />
      </div>
      
      {/* Loading Content */}
      <div className="typing-content">
        <div className="typing-message-row">
          <div className="typing-icon-wrapper">
            <IconComponent className="typing-message-icon" />
          </div>
          <span className="typing-message-text" key={messageIndex}>
            {currentMessage.text}
          </span>
        </div>
        
        {/* Animated Progress Bar */}
        <div className="typing-progress-bar">
          <div className="typing-progress-fill"></div>
        </div>
        
        {/* Bouncing Dots */}
        <div className="typing-dots">
          <div className="typing-dot"></div>
          <div className="typing-dot"></div>
          <div className="typing-dot"></div>
        </div>
      </div>
    </div>
  );
};

export default TypingIndicator;
