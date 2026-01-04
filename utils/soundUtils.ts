
const audioCtx = typeof window !== 'undefined' ? new (window.AudioContext || (window as any).webkitAudioContext)() : null;
let isMuted = localStorage.getItem('hexacon_muted') === 'true';

export const toggleMute = () => {
  isMuted = !isMuted;
  localStorage.setItem('hexacon_muted', String(isMuted));
  return isMuted;
};

export const getMuteState = () => isMuted;

const playTone = (freq: number, type: OscillatorType, duration: number, startTime: number = 0, vol: number = 0.1) => {
    if (!audioCtx || isMuted) return;
    if (audioCtx.state === 'suspended') audioCtx.resume();

    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime + startTime);
    
    gain.gain.setValueAtTime(vol, audioCtx.currentTime + startTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + startTime + duration);

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.start(audioCtx.currentTime + startTime);
    osc.stop(audioCtx.currentTime + startTime + duration);
};

export const playSound = (effect: 'MOVE' | 'ATTACK_WIN' | 'ATTACK_LOSS' | 'BUILD' | 'TURN_START' | 'GAME_OVER') => {
    if (!audioCtx) return;

    switch (effect) {
        case 'MOVE':
            // Quick slide
            playTone(300, 'sine', 0.1, 0, 0.05);
            break;
        case 'ATTACK_WIN':
            // Sharp impact
            playTone(150, 'square', 0.1, 0, 0.1);
            playTone(100, 'sawtooth', 0.2, 0.05, 0.1);
            break;
        case 'ATTACK_LOSS':
            // Dull thud
            playTone(100, 'triangle', 0.3, 0, 0.1);
            playTone(80, 'triangle', 0.3, 0.1, 0.1);
            break;
        case 'BUILD':
            // Construction chime
            playTone(400, 'sine', 0.1, 0, 0.05);
            playTone(600, 'sine', 0.1, 0.1, 0.05);
            playTone(800, 'sine', 0.2, 0.2, 0.05);
            break;
        case 'TURN_START':
            // Positive chord
            playTone(440, 'sine', 0.4, 0, 0.05);
            playTone(554, 'sine', 0.4, 0.1, 0.05); // C#
            playTone(659, 'sine', 0.6, 0.2, 0.05); // E
            break;
        case 'GAME_OVER':
             playTone(200, 'sawtooth', 0.5, 0, 0.1);
             playTone(150, 'sawtooth', 1.0, 0.5, 0.1);
             break;
    }
};
