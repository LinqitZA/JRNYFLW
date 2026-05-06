import React from 'react';

type LockedFeatureGuardProps = {
  children: React.ReactNode;
  locked?: boolean;
  lockTitle?: string;
  lockDescription?: string;
  lockVideoUrl?: string;
  lockDocumentationUrl?: string;
  featureKey?: string;
};

export const LockedFeatureGuard = ({ children }: LockedFeatureGuardProps) => {
  return <>{children}</>;
};

export default LockedFeatureGuard;
