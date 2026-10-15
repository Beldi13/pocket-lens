use crate::model::{AppError, Result};
use base64::{Engine, engine::general_purpose::STANDARD};
use image::{ImageReader, codecs::jpeg::JpegEncoder};
use std::{io::Cursor, path::Path};

pub const MAX_INPUT: usize = 20 * 1024 * 1024;

/// Decode only supported raster formats, bound allocations, strip metadata and shrink.
pub fn normalize(bytes: &[u8]) -> Result<String> {
    let invalid = || {
        AppError::new(
            "artwork_invalid",
            "Choose a PNG, JPEG or WebP image under 20 MB",
        )
    };
    if bytes.is_empty() || bytes.len() > MAX_INPUT {
        return Err(invalid());
    }
    let mut reader = ImageReader::new(Cursor::new(bytes))
        .with_guessed_format()
        .map_err(|_| invalid())?;
    let mut limits = image::Limits::default();
    limits.max_image_width = Some(16384);
    limits.max_image_height = Some(16384);
    limits.max_alloc = Some(96 * 1024 * 1024);
    reader.limits(limits);
    let image = reader.decode().map_err(|_| invalid())?;
    let thumbnail = image.thumbnail(768, 768).to_rgb8();
    let mut jpeg = Vec::new();
    JpegEncoder::new_with_quality(&mut jpeg, 82)
        .encode_image(&thumbnail)
        .map_err(|_| invalid())?;
    Ok(format!("data:image/jpeg;base64,{}", STANDARD.encode(jpeg)))
}

pub fn read_image(path: &Path) -> Result<String> {
    use std::io::Read;
    let file = std::fs::File::open(path)
        .map_err(|_| AppError::new("artwork_invalid", "Could not read the selected image"))?;
    let mut bytes = Vec::new();
    file.take(MAX_INPUT as u64 + 1).read_to_end(&mut bytes)?;
    normalize(&bytes)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_non_images_and_oversized_files() {
        assert!(normalize(b"<svg onload='bad' />").is_err());
        assert!(normalize(&vec![0; MAX_INPUT + 1]).is_err());
    }

    #[test]
    fn shrinks_raster_and_returns_only_a_jpeg() {
        let original = image::RgbImage::from_pixel(1600, 2400, image::Rgb([30, 80, 70]));
        let mut input = Cursor::new(Vec::new());
        original
            .write_to(&mut input, image::ImageFormat::Png)
            .unwrap();
        let normalized = normalize(input.get_ref()).unwrap();
        let decoded = STANDARD
            .decode(normalized.strip_prefix("data:image/jpeg;base64,").unwrap())
            .unwrap();
        let thumbnail = image::load_from_memory(&decoded).unwrap();
        assert_eq!((thumbnail.width(), thumbnail.height()), (512, 768));
        assert!(normalized.len() < 100_000);
    }
}
