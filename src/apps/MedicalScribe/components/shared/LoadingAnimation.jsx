import React from 'react';
import { getAssetPath } from '../../utils/helpers';
import './LoadingAnimation.css';

export const LoadingAnimation = ({ message = "Generating clinical note..." }) => {
  return (
    <div className="loading-animation-container">
      <div className="loading-icon-wrapper">
        <img
          src={getAssetPath("/stethoscribe_icon.png")}
          alt="Loading"
          className="loading-icon"
        />
        <div className="pulse-ring pulse-ring-1"></div>
        <div className="pulse-ring pulse-ring-2"></div>
        <div className="pulse-ring pulse-ring-3"></div>
      </div>
      <p className="loading-message">{message}</p>
      <div className="loading-dots">
        <span className="dot dot-1"></span>
        <span className="dot dot-2"></span>
        <span className="dot dot-3"></span>
      </div>
    </div>
  );
};