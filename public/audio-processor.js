// audio-processor.js

// An audio worklet processor that buffers audio, downsamples it to 16kHz,
// and sends it to the main thread in appropriately sized chunks.
class AudioDownsamplerProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.outputRate = 16000; // Target sample rate for AWS
    this.buffer = [];        // Buffer to hold incoming audio data
    
    // Sending audio chunks of ~100ms.
    // 16000 samples/sec * 0.1 sec = 1600 samples per chunk.
    this.bufferSize = 1600; 
  }

  // Downsampling function
  downsampleBuffer(buffer, inputRate, outputRate) {
    if (inputRate === outputRate) return buffer;
    const ratio = inputRate / outputRate;
    const newLength = Math.round(buffer.length / ratio);
    const result = new Float32Array(newLength);
    let offsetRes = 0;
    let offsetBuf = 0;
    while (offsetRes < result.length) {
      const nextOffset = Math.round((offsetRes + 1) * ratio);
      let accum = 0;
      let count = 0;
      for (let i = offsetBuf; i < nextOffset && i < buffer.length; i++) {
        accum += buffer[i];
        count++;
      }
      result[offsetRes] = accum / count;
      offsetRes++;
      offsetBuf = nextOffset;
    }
    return result;
  }

  process(inputs) {
    const inputRate = sampleRate;
    const inputChannel = inputs[0][0];

    if (!inputChannel) {
      return true;
    }

    // downsample the incoming 128-sample chunk
    const downsampled = this.downsampleBuffer(inputChannel, inputRate, this.outputRate);

    // Add downsampled audio to our internal buffer
    this.buffer.push(...downsampled);

    // While our buffer is larger than the target size, send chunks
    while (this.buffer.length >= this.bufferSize) {
      // Grab the chunk to send
      const chunk = this.buffer.slice(0, this.bufferSize);
      
      // Create a Float32Array from the chunk
      const pcmFloat32 = new Float32Array(chunk);

      // Post the chunk back to the main thread for sending over WebSocket
      this.port.postMessage(pcmFloat32.buffer, [pcmFloat32.buffer]);

      // Remove the sent chunk from the beginning of our buffer
      this.buffer = this.buffer.slice(this.bufferSize);
    }

    return true; // Keep the processor alive
  }
}

registerProcessor('audio-downsampler-processor', AudioDownsamplerProcessor);