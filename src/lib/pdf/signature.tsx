import { Image, StyleSheet, Text, View } from '@react-pdf/renderer'

/**
 * The signature block of a PDF: "For <legal name>", the signature image (or a blank rule to sign on),
 * the signatory's name and designation, and the company seal beside it when one is set. Images are data
 * URIs read server-side (lib/pdf/company), so the private signature file never travels as a URL.
 */

export type PdfSignature = {
  /** The company the signatory signs for: "For Sanskaar Webx Services LLP". */
  forName: string
  name?: string | null
  designation?: string | null
  imageSrc?: string | null
  sealSrc?: string | null
}

const INK = '#1A1626'
const MUTED = '#6B6478'
const RULE = '#E6E1EC'

const s = StyleSheet.create({
  wrap: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'flex-end', marginTop: 22, gap: 12 },
  seal: { width: 64, height: 64, objectFit: 'contain' },
  block: { alignItems: 'flex-end', width: 200 },
  line: { color: MUTED, fontSize: 8.5 },
  image: { height: 36, maxWidth: 180, objectFit: 'contain', marginVertical: 4 },
  rule: { borderTopWidth: 1, borderColor: RULE, width: 160, marginTop: 28, marginBottom: 3 },
  name: { color: INK, fontSize: 9, fontWeight: 700 },
})

export const DEFAULT_DESIGNATION = 'Authorised Signatory'

export function PdfSignatureBlock({ signature }: { signature: PdfSignature }) {
  return (
    <View style={s.wrap} wrap={false}>
      {/* eslint-disable-next-line jsx-a11y/alt-text */}
      {signature.sealSrc ? <Image src={signature.sealSrc} style={s.seal} /> : null}
      <View style={s.block}>
        <Text style={s.line}>For {signature.forName}</Text>
        {/* eslint-disable-next-line jsx-a11y/alt-text */}
        {signature.imageSrc ? <Image src={signature.imageSrc} style={s.image} /> : <View style={s.rule} />}
        {signature.name ? <Text style={s.name}>{signature.name}</Text> : null}
        <Text style={s.line}>{signature.designation || DEFAULT_DESIGNATION}</Text>
      </View>
    </View>
  )
}
