// audio.js - Web Audio API Synthesizer for Gotham Grit

class BatAudioController {
  constructor() {
    this.ctx = null;
    this.muted = false;
  }

  init() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  toggleMute() {
    this.muted = !this.muted;
    return this.muted;
  }

  // Synthesize a quick terminal click (high-tech beep)
  playClick() {
    if (this.muted) return;
    this.init();
    
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1000, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(3000, this.ctx.currentTime + 0.05);
    
    gain.gain.setValueAtTime(0.04, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + 0.05);
    
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    
    osc.start();
    osc.stop(this.ctx.currentTime + 0.05);
  }

  // Synthesize a satisfying futuristic metallic chime (task checked)
  playCheck() {
    if (this.muted) return;
    this.init();
    
    const now = this.ctx.currentTime;
    
    // Cyber chime: 3 harmonious frequencies rising
    const freqs = [523.25, 659.25, 783.99]; // C5, E5, G5
    
    freqs.forEach((freq, index) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const delay = index * 0.04;
      
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + delay);
      osc.frequency.exponentialRampToValueAtTime(freq * 1.5, now + delay + 0.15);
      
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.08, now + delay + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + delay + 0.3);
      
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      
      osc.start(now + delay);
      osc.stop(now + delay + 0.3);
    });
  }

  // Synthesize a downward tone (task unchecked)
  playUncheck() {
    if (this.muted) return;
    this.init();
    
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(600, now);
    osc.frequency.exponentialRampToValueAtTime(200, now + 0.15);
    
    gain.gain.setValueAtTime(0.06, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.15);
    
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    
    osc.start();
    osc.stop(now + 0.15);
  }

  // Synthesize an alarm/warning tone (errors/deletions)
  playWarning() {
    if (this.muted) return;
    this.init();
    
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(150, now);
    osc.frequency.linearRampToValueAtTime(100, now + 0.15);
    
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(300, now);
    
    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.15);
    
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);
    
    osc.start();
    osc.stop(now + 0.15);
  }

  // Synthesize a massive sub-bass cinematic drop + flapping wings (100% completion)
  playVengeanceSound() {
    if (this.muted) return;
    this.init();
    
    const now = this.ctx.currentTime;
    
    // 1. Cinematic Bass Drop
    const subOsc = this.ctx.createOscillator();
    const subGain = this.ctx.createGain();
    const subFilter = this.ctx.createBiquadFilter();
    
    subOsc.type = 'sawtooth';
    subOsc.frequency.setValueAtTime(90, now);
    subOsc.frequency.exponentialRampToValueAtTime(35, now + 1.8);
    
    subFilter.type = 'lowpass';
    subFilter.frequency.setValueAtTime(150, now);
    subFilter.frequency.exponentialRampToValueAtTime(50, now + 1.8);
    
    subGain.gain.setValueAtTime(0, now);
    subGain.gain.linearRampToValueAtTime(0.35, now + 0.1);
    subGain.gain.exponentialRampToValueAtTime(0.0001, now + 2.0);
    
    subOsc.connect(subFilter);
    subFilter.connect(subGain);
    subGain.connect(this.ctx.destination);
    
    subOsc.start(now);
    subOsc.stop(now + 2.0);
    
    // 2. Synthesized Wing Flutter (Bat wings fluttering away)
    // We create multiple rapid bandpass-filtered noise-like chirps
    for (let i = 0; i < 18; i++) {
      const flutterTime = now + (i * 0.08);
      const duration = 0.06;
      
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const filter = this.ctx.createBiquadFilter();
      
      // We use a high pitch triangle wave modulated to sound like air friction
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(200 + (Math.random() * 300), flutterTime);
      osc.frequency.exponentialRampToValueAtTime(50, flutterTime + duration);
      
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(800, flutterTime);
      
      // Volume scales down as the "bats" fly away
      const vol = 0.15 * Math.pow(0.85, i);
      gain.gain.setValueAtTime(0, flutterTime);
      gain.gain.linearRampToValueAtTime(vol, flutterTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, flutterTime + duration);
      
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);
      
      osc.start(flutterTime);
      osc.stop(flutterTime + duration);
    }
  }
}

const batAudio = new BatAudioController();
export default batAudio;
