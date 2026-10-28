'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Lock, Delete, X, ShieldAlert } from 'lucide-react';

interface ParentalPinModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  correctPin?: string;
  categoryName?: string;
}

export const ParentalPinModal: React.FC<ParentalPinModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  correctPin = '0000',
  categoryName,
}) => {
  const [pin, setPin] = useState('');
  const [hasError, setHasError] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [focusedKeyIndex, setFocusedKeyIndex] = useState<number>(0);

  // Pad layout: 1-9, cancel, 0, backspace
  const PAD_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'cancel', '0', 'back'];

  useEffect(() => {
    if (isOpen) {
      setPin('');
      setHasError(false);
      setErrorMessage('');
      setFocusedKeyIndex(0);
    }
  }, [isOpen]);

  const handleDigit = (digit: string) => {
    if (pin.length >= 4) return;
    const nextPin = pin + digit;
    setPin(nextPin);
    setHasError(false);

    if (nextPin.length === 4) {
      if (nextPin === correctPin) {
        onSuccess();
      } else {
        setHasError(true);
        setErrorMessage('Code PIN incorrect');
        setTimeout(() => {
          setPin('');
        }, 600);
      }
    }
  };

  const handleBackspace = () => {
    setPin((prev) => prev.slice(0, -1));
    setHasError(false);
  };

  // Keyboard and remote D-Pad controls
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const isUp = e.key === 'ArrowUp' || (e as any).keyCode === 38;
      const isDown = e.key === 'ArrowDown' || (e as any).keyCode === 40;
      const isLeft = e.key === 'ArrowLeft' || (e as any).keyCode === 37;
      const isRight = e.key === 'ArrowRight' || (e as any).keyCode === 39;
      const isEnter =
        e.key === 'Enter' ||
        e.key === 'Select' ||
        (e as any).keyCode === 13 ||
        (e as any).keyCode === 23;
      const isBack =
        e.key === 'Escape' ||
        e.key === 'Backspace' ||
        (e as any).keyCode === 27 ||
        (e as any).keyCode === 4;

      if (e.key >= '0' && e.key <= '9') {
        e.preventDefault();
        handleDigit(e.key);
        return;
      }

      if (e.key === 'Backspace') {
        e.preventDefault();
        handleBackspace();
        return;
      }

      if (isBack) {
        e.preventDefault();
        onClose();
        return;
      }

      if (isLeft) {
        e.preventDefault();
        setFocusedKeyIndex((prev) => (prev % 3 > 0 ? prev - 1 : prev + 2));
        return;
      }

      if (isRight) {
        e.preventDefault();
        setFocusedKeyIndex((prev) => (prev % 3 < 2 ? prev + 1 : prev - 2));
        return;
      }

      if (isUp) {
        e.preventDefault();
        setFocusedKeyIndex((prev) => (prev >= 3 ? prev - 3 : prev + 9));
        return;
      }

      if (isDown) {
        e.preventDefault();
        setFocusedKeyIndex((prev) => (prev <= 8 ? prev + 3 : prev - 9));
        return;
      }

      if (isEnter) {
        e.preventDefault();
        const key = PAD_KEYS[focusedKeyIndex];
        if (key === 'cancel') {
          onClose();
        } else if (key === 'back') {
          handleBackspace();
        } else {
          handleDigit(key);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, pin, correctPin, focusedKeyIndex]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-sm bg-tv-surface border border-tv-border rounded-3xl p-6 shadow-2xl flex flex-col items-center text-center">
        {/* Header Icon */}
        <div className="w-16 h-16 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center mb-3">
          <Lock className="w-8 h-8 text-rose-400" />
        </div>

        <h3 className="text-lg font-black text-white">Contrôle Parental</h3>
        <p className="text-xs text-slate-400 mt-1 mb-4">
          {categoryName ? (
            <>Le bouquet <span className="text-white font-semibold">« {categoryName} »</span> est verrouillé.</>
          ) : (
            'Contenu réservé aux adultes. Veuillez entrer le code PIN.'
          )}
        </p>

        {/* 4 Pin Dots */}
        <div className={`flex items-center space-x-3 mb-4 ${hasError ? 'animate-bounce' : ''}`}>
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className={`w-4 h-4 rounded-full border-2 transition-transform ${
                i < pin.length
                  ? hasError
                    ? 'bg-rose-500 border-rose-500'
                    : 'bg-tv-accent border-tv-accent scale-110 shadow-lg shadow-sky-400/50'
                  : 'bg-slate-800 border-slate-700'
              }`}
            />
          ))}
        </div>

        {errorMessage && (
          <p className="text-xs text-rose-400 font-bold mb-3 flex items-center space-x-1">
            <ShieldAlert className="w-3.5 h-3.5" />
            <span>{errorMessage}</span>
          </p>
        )}

        {/* Numeric TV Keypad */}
        <div className="grid grid-cols-3 gap-2.5 w-full max-w-[260px] mb-4">
          {PAD_KEYS.map((k, idx) => {
            const isFocused = focusedKeyIndex === idx;
            const isAction = k === 'cancel' || k === 'back';

            return (
              <button
                key={k}
                type="button"
                onClick={() => {
                  if (k === 'cancel') onClose();
                  else if (k === 'back') handleBackspace();
                  else handleDigit(k);
                }}
                className={`h-12 rounded-2xl flex items-center justify-center font-bold text-lg transition select-none ${
                  isAction
                    ? 'bg-slate-800/80 hover:bg-slate-700 text-slate-300 text-sm'
                    : 'bg-tv-card hover:bg-tv-cardHover text-white'
                } ${
                  isFocused
                    ? 'bg-tv-focus text-white ring-2 ring-tv-accent ring-offset-2 ring-offset-tv-bg scale-105 z-10'
                    : 'border border-white/5'
                }`}
              >
                {k === 'cancel' ? (
                  <X className="w-5 h-5" />
                ) : k === 'back' ? (
                  <Delete className="w-5 h-5" />
                ) : (
                  k
                )}
              </button>
            );
          })}
        </div>

        <p className="text-[10px] text-slate-500">
          PIN par défaut : <span className="font-mono font-bold text-slate-400">0000</span> (modifiable dans les Options)
        </p>
      </div>
    </div>
  );
};
