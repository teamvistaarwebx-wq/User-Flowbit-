import { ProviderError, type TranscriptionProvider } from './transcription'

/**
 * Deepgram adapter: a stub so the interface has a second provider to switch
 * to. Not wired: Sarvam handles Hinglish code-mix with diarization at a lower
 * price (₹45 an hour). Fill in pre-recorded /v1/listen with diarize=true when needed.
 */
export function deepgramProvider(): TranscriptionProvider {
  const off = async (): Promise<never> => {
    throw new ProviderError('Deepgram transcription is not set up. Flowbit uses Sarvam.')
  }
  return { name: 'deepgram', start: off, poll: off }
}
