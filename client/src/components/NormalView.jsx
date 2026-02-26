import React from 'react';
import AccessPrompt from './AccessPrompt';

export default function NormalView({ children, accessPromptProps }) {
  return (
    <div className="normal-shell">
      {children}
      <AccessPrompt {...accessPromptProps} />
    </div>
  );
}
