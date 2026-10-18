import React, { useState } from 'react';
import { ShieldAlert, RefreshCw, LogOut, Clock, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/features/auth/context/AuthContext';
import type { MaintenanceStatus } from '@/features/admin/services/maintenanceService';

interface EmergencyMaintenanceScreenProps {
  maintenance?: MaintenanceStatus;
  onRefresh?: () => void;
}

export const EmergencyMaintenanceScreen: React.FC<EmergencyMaintenanceScreenProps> = ({
  maintenance,
  onRefresh
}) => {
  const { signOut } = useAuth();
  const [isChecking, setIsChecking] = useState(false);

  const handleRefresh = async () => {
    setIsChecking(true);
    if (onRefresh) await onRefresh();
    setTimeout(() => setIsChecking(false), 800);
  };

  return (
    <main 
      id="maintenance-content"
      aria-label="System Emergency Maintenance Screen"
      className="min-h-dvh w-full flex flex-col items-center justify-center p-4 sm:p-6 bg-[#140F0E] text-[#FAF7F2] relative overflow-hidden select-none"
    >
      {/* Background ambient gradient */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,var(--tw-gradient-stops))] from-amber-950/20 via-[#140F0E]/80 to-[#140F0E] pointer-events-none" />

      <div className="relative z-10 w-full max-w-lg p-6 sm:p-8 rounded-3xl bg-[#1E1715] border border-[#3A2A24] shadow-2xl text-center space-y-6">
        {/* Pulsing emergency beacon */}
        <div className="mx-auto w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-amber-500/10 border border-amber-500/25 flex items-center justify-center text-amber-500 shadow-inner">
          <ShieldAlert className="w-8 h-8 sm:w-10 sm:h-10 animate-pulse" />
        </div>

        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30">
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>EMERGENCY MAINTENANCE LOCKDOWN</span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white mt-1">
            System Temporarily Offline
          </h1>

          <p className="text-xs sm:text-sm text-[#D1C7BD] leading-relaxed max-w-md mx-auto">
            {maintenance?.reason || 'KUVENTORY is currently undergoing high-priority database maintenance and state synchronization. Direct transactions and modifications are temporarily suspended to guarantee data integrity.'}
          </p>
        </div>

        {/* Status card */}
        <div className="p-4 rounded-2xl bg-[#261E1B] border border-[#3A2A24] text-left space-y-2.5 text-xs text-[#B5A89B]">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-[#E6DED6]">Operational State:</span>
            <span className="font-mono font-bold text-amber-400 px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/20">
              {maintenance?.status || 'MAINTENANCE'}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span className="font-semibold text-[#E6DED6]">Protection Scope:</span>
            <span className="text-emerald-400 font-medium">Non-Destructive Lockdown</span>
          </div>

          {maintenance?.locked_at && (
            <div className="flex items-center justify-between text-[11px] pt-1 border-t border-[#3A2A24]">
              <span className="flex items-center gap-1 text-muted-foreground">
                <Clock className="w-3 h-3" /> Activated:
              </span>
              <span className="font-mono text-[#D1C7BD]">
                {new Date(maintenance.locked_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })}
              </span>
            </div>
          )}
        </div>

        {/* Action Controls */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={handleRefresh}
            disabled={isChecking}
            className="w-full sm:w-auto h-11 px-5 border-[#3A2A24] bg-[#261E1B] text-[#FAF7F2] hover:bg-[#322723] hover:text-white font-bold cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${isChecking ? 'animate-spin' : ''}`} />
            Check System Status
          </Button>

          <Button
            type="button"
            variant="ghost"
            onClick={signOut}
            className="w-full sm:w-auto h-11 px-5 text-[#B5A89B] hover:text-white hover:bg-[#261E1B] font-semibold cursor-pointer"
          >
            <LogOut className="w-4 h-4 mr-2" />
            Sign Out
          </Button>
        </div>

        <p className="text-[11px] text-[#8C7E72] pt-2">
          If you require immediate emergency access or clearance, please contact the Super Administrator.
        </p>
      </div>
    </main>
  );
};
