export function squareImage(file: File) {
  return new Promise<Blob>((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      const size = 256
      const canvas = document.createElement('canvas')
      canvas.width = size
      canvas.height = size
      const context = canvas.getContext('2d')
      if (!context) {
        URL.revokeObjectURL(url)
        reject(new Error('写真を処理できません'))
        return
      }
      const side = Math.min(image.width, image.height)
      const sx = (image.width - side) / 2
      const sy = (image.height - side) / 2
      context.drawImage(image, sx, sy, side, side, 0, 0, size, size)
      canvas.toBlob(
        (blob) => {
          URL.revokeObjectURL(url)
          if (!blob) reject(new Error('写真を処理できません'))
          else resolve(blob)
        },
        'image/jpeg',
        0.86,
      )
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('写真を読み込めません'))
    }
    image.src = url
  })
}
