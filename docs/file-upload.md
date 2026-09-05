# File Upload Handling

Subatom provides comprehensive multipart form data handling with support for both disk and memory storage, automatic cleanup, and type-safe file access.

## Overview

File upload handling in Subatom:
- Supports single and multiple file uploads
- Memory or disk storage strategies
- Automatic temporary file cleanup
- Type-safe file access via context
- Multipart form parsing and validation
- Stream or buffer access to file content

## File Upload Basics

### Single File Upload

```typescript
import infer from "subatom-infer";

app.post("/avatar", {
  schema: {
    files: infer.file().max(10485760),  // Field name
  },
  controller: async (ctx) => {
    const upload = ctx.files.file;  // IFileUpload

    if (!upload) {
      ctx.res.status(400).json({ error: "No file provided" });
      return;
    }

    console.log(upload.filename);   // "profile.jpg"
    console.log(upload.mimetype);   // "image/jpeg"
    console.log(upload.size);       // 1024000
    console.log(upload.encoding);   // "7bit"
    console.log(upload.storageType); // "disk" or "memory"

    // Access file content
    const buffer = await upload.buffer();
    const stream = upload.stream();

    // Cleanup
    await upload.destroy();

    ctx.res.json({ success: true });
  },
});
```

### Multiple Files Upload

```typescript
app.post("/photos", {
  schema: {
    files: infer.files().max(10),
  },
  controller: async (ctx) => {
    const uploads = ctx.files.files;  // Record<string, IFileUpload[]>

    for (const upload of uploads.photos) {
      const buffer = await upload.buffer();
      await processImage(buffer);
      await upload.destroy();
    }

    ctx.res.json({ uploaded: uploads.photos.length });
  },
});
```

### Multiple Fields Upload

```typescript
app.post("/media", {
  schema: {
    files: infer.files().min(1).max(5),
  },
  controller: async (ctx) => {
    const uploads = ctx.files.files;

    // Process avatar
    if (uploads.avatar?.[0]) {
      const buffer = await uploads.avatar[0].buffer();
      await saveAvatar(buffer);
      await uploads.avatar[0].destroy();
    }

    // Process gallery
    for (const upload of uploads.gallery || []) {
      const buffer = await upload.buffer();
      await saveGalleryImage(buffer);
      await upload.destroy();
    }

    ctx.res.json({ success: true });
  },
});
```

### Any Files Upload

```typescript
app.post("/upload", {
  schema: {
    files: infer.files(),  // Accept any files
  },
  controller: async (ctx) => {
    const uploads = ctx.files.files;  // Record<string, IFileUpload[]>

    for (const [fieldName, fileArray] of Object.entries(uploads)) {
      for (const upload of fileArray) {
        console.log(`${fieldName}: ${upload.filename}`);
        await upload.destroy();
      }
    }

    ctx.res.json({ success: true });
  },
});
```

### No Files Upload

```typescript
app.post("/data", {
  schema: {
    body: infer.object({ name: infer.string() }),
    files: infer.files().max(0),  // Reject file uploads
  },
  controller: (ctx) => {
    // files and file are always undefined
    ctx.res.json(ctx.body);
  },
});
```

## FileUpload Class

The `FileUpload` class encapsulates uploaded file data and metadata.

### Properties

```typescript
interface FileUpload {
  readonly filename: string;          // "document.pdf"
  readonly encoding: string;          // "7bit"
  readonly mimetype: string;          // "application/pdf"
  readonly storageType: "disk" | "memory";
  readonly path?: string;             // Disk path if stored on disk
  readonly size?: number;             // File size in bytes
  readonly destroyed: boolean;        // Cleanup status
}
```

### Methods

#### buffer()

```typescript
public async buffer(): Promise<Buffer>
```

Returns file content as Buffer.

**Throws:** Error if file is destroyed or content unavailable.

**Example:**
```typescript
const buffer = await upload.buffer();
const json = JSON.parse(buffer.toString());
```

#### stream()

```typescript
public stream(): Readable
```

Returns Readable stream for file content.

**Useful for:** Large files, piping, streaming to storage.

**Example:**
```typescript
const stream = upload.stream();
const writeStream = fs.createWriteStream("/tmp/saved.pdf");
stream.pipe(writeStream);

await new Promise((resolve, reject) => {
  writeStream.on("finish", resolve);
  writeStream.on("error", reject);
});
```

#### destroy()

```typescript
public async destroy(): Promise<void>
```

Cleanup file resources (delete temp file if disk storage, clear buffer if memory).

**Must be called** to avoid disk leaks and memory waste.

**Example:**
```typescript
try {
  const buffer = await upload.buffer();
  await processFile(buffer);
} finally {
  await upload.destroy();  // Always cleanup
}
```

#### toJSON()

```typescript
public toJSON(): object
```

Serialize to JSON (excludes buffer content).

**Example:**
```typescript
const metadata = upload.toJSON();
// { filename, encoding, mimetype, storageType, size, path }
```

## File Validation

### By MIME Type

```typescript
app.post("/avatar", {
  schema: {
    files: infer.file().max(10485760),
  },
  controller: async (ctx) => {
    const upload = ctx.files.file;

    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!allowedTypes.includes(upload.mimetype)) {
      await upload.destroy();
      throw new FileFilterError(
        `Invalid file type. Expected image, got ${upload.mimetype}`
      );
    }

    // Process file
    await saveAvatar(await upload.buffer());
    await upload.destroy();
  },
});
```

### By File Size

```typescript
app.post("/document", {
  schema: {
    files: infer.file().max(10485760),
  },
  controller: async (ctx) => {
    const upload = ctx.files.file;
    const maxSize = 5 * 1024 * 1024;  // 5MB

    if (upload.size && upload.size > maxSize) {
      await upload.destroy();
      throw new PayloadTooLargeError(
        `File too large. Max size: ${maxSize} bytes`
      );
    }

    // Process file
    await saveDocument(await upload.buffer());
    await upload.destroy();
  },
});
```

### By File Extension

```typescript
import path from "path";

app.post("/csv", {
  schema: {
    files: infer.file().max(10485760),
  },
  controller: async (ctx) => {
    const upload = ctx.files.file;
    const ext = path.extname(upload.filename).toLowerCase();

    if (ext !== ".csv") {
      await upload.destroy();
      throw new FileFilterError("Only CSV files allowed");
    }

    // Process CSV
    const text = (await upload.buffer()).toString();
    const records = parseCSV(text);
    await upload.destroy();

    ctx.res.json({ records });
  },
});
```

### By File Content

```typescript
import { fileTypeFromBuffer } from "file-type";

app.post("/image", {
  schema: {
    files: infer.file().max(10485760),
  },
  controller: async (ctx) => {
    const upload = ctx.files.file;
    const buffer = await upload.buffer();

    // Verify magic bytes
    const type = await fileTypeFromBuffer(buffer);
    if (!type || !type.mime.startsWith("image/")) {
      await upload.destroy();
      throw new FileFilterError("Invalid image file");
    }

    // Process image
    await saveImage(buffer);
    await upload.destroy();
  },
});
```

## Storage Strategies

### Memory Storage

Stores file in RAM (good for small files):

```typescript
// Configuration (application startup)
app.setConfig({
  fileUpload: {
    storage: "memory",
    maxMemorySize: 5 * 1024 * 1024,  // 5MB per file
  },
});

app.post("/small-file", {
  schema: { files: infer.file().max(10485760) },
  controller: async (ctx) => {
    // File is in memory
    const buffer = await ctx.files.file.buffer();
    // Fast access, no disk I/O
  },
});
```

**Pros:**
- Fast access
- No disk I/O
- Simple cleanup

**Cons:**
- Limited by available RAM
- Entire file in memory
- Not suitable for large files

### Disk Storage

Stores file in temporary directory (good for large files):

```typescript
// Configuration
app.setConfig({
  fileUpload: {
    storage: "disk",
    tempDir: "/tmp/uploads",
    maxDiskSize: 100 * 1024 * 1024,  // 100MB per file
  },
});

app.post("/large-file", {
  schema: { files: infer.file().max(10485760) },
  controller: async (ctx) => {
    // File is on disk
    const path = ctx.files.file.path;  // "/tmp/uploads/xyz.tmp"
    const stream = ctx.files.file.stream();
    // Process via stream to avoid loading entire file in memory
  },
});
```

**Pros:**
- Supports large files
- Minimal memory usage
- Streaming access

**Cons:**
- Disk I/O overhead
- Must cleanup temp files
- Requires temp directory

## Stream Processing

### Piping to Storage

```typescript
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const s3 = new S3Client();

app.post("/upload-to-s3", {
  schema: { files: infer.file().max(10485760) },
  controller: async (ctx) => {
    const upload = ctx.files.file;
    const stream = upload.stream();

    try {
      await s3.send(new PutObjectCommand({
        Bucket: "my-bucket",
        Key: `uploads/${upload.filename}`,
        Body: stream,
        ContentType: upload.mimetype,
      }));
      ctx.res.json({ success: true, key: `uploads/${upload.filename}` });
    } finally {
      await upload.destroy();
    }
  },
});
```

### Piping to Transform

```typescript
import sharp from "sharp";

app.post("/resize", {
  schema: { files: infer.file().max(10485760) },
  controller: async (ctx) => {
    const upload = ctx.files.file;
    const stream = upload.stream();

    try {
      const resized = await sharp()
        .resize(200, 200)
        .toBuffer();

      await saveResized(resized);
      ctx.res.json({ success: true });
    } finally {
      await upload.destroy();
    }
  },
});
```

## Form Data with Files

### Mixed Content Upload

```typescript
app.post("/post", {
  schema: {
    body: infer.object({
      title: infer.string(),
      content: infer.string(),
      tags: infer.string().transform(s => s.split(",")),
    }),
    files: infer.file().max(10485760),
  },
  controller: async (ctx) => {
    const { title, content, tags } = ctx.body;
    const image = ctx.files.file;

    let imageUrl: string | undefined;
    if (image) {
      const buffer = await image.buffer();
      imageUrl = await uploadImage(buffer);
      await image.destroy();
    }

    const post = await createPost({
      title,
      content,
      tags,
      imageUrl,
    });

    ctx.res.status(201).json(post);
  },
});

// Client side:
// const formData = new FormData();
// formData.append("title", "My Post");
// formData.append("content", "...");
// formData.append("tags", "tag1,tag2");
// formData.append("image", fileInput.files[0]);
// await fetch("/post", { method: "POST", body: formData });
```

## Error Handling

### Cleanup on Error

```typescript
app.post("/process", {
  schema: { files: infer.file().max(10485760) },
  controller: async (ctx) => {
    const upload = ctx.files.file;
    try {
      const buffer = await upload.buffer();
      const result = await risky(buffer);
      ctx.res.json(result);
    } catch (err) {
      // Cleanup even if processing fails
      await upload.destroy();
      throw err;
    }
  },
});
```

### Validation Errors

```typescript
app.post("/upload", {
  schema: { files: infer.file().max(10485760) },
  controller: async (ctx) => {
    const upload = ctx.files.file;

    // Validate early
    if (!upload) {
      ctx.res.status(400).json({ error: "No file" });
      return;  // No cleanup needed
    }

    if (upload.size > 10 * 1024 * 1024) {
      await upload.destroy();
      throw new PayloadTooLargeError();
    }

    // Process...
  },
});
```

## Production Best Practices

### 1. Always Cleanup Files

```typescript
app.post("/upload", {
  schema: { files: infer.file().max(10485760) },
  controller: async (ctx) => {
    const upload = ctx.files.file;
    try {
      await processFile(upload);
    } finally {
      // Cleanup even if error occurs
      await upload.destroy();
    }
  },
});
```

### 2. Validate Before Processing

```typescript
app.post("/avatar", {
  schema: { files: infer.file().max(10485760) },
  controller: async (ctx) => {
    const upload = ctx.files.file;

    // Quick validation first
    if (!upload || !upload.mimetype.startsWith("image/")) {
      if (upload) await upload.destroy();
      throw new FileFilterError("Invalid file");
    }

    try {
      // Then process
      await saveAvatar(await upload.buffer());
    } finally {
      await upload.destroy();
    }
  },
});
```

### 3. Stream Large Files

```typescript
app.post("/video", {
  schema: { files: infer.file().max(10485760) },
  controller: async (ctx) => {
    const upload = ctx.files.file;
    try {
      // Use streaming instead of buffer() for large files
      const stream = upload.stream();
      await saveVideo(stream);
    } finally {
      await upload.destroy();
    }
  },
});
```

### 4. Multiple File Progress

```typescript
app.post("/bulk-upload", {
  schema: {
    files: infer.files().max(100),
  },
  controller: async (ctx) => {
    const results = [];
    const errors = [];

    for (let i = 0; i < ctx.files.files.files.length; i++) {
      const upload = ctx.files.files.files[i];
      try {
        const buffer = await upload.buffer();
        const url = await saveFile(buffer);
        results.push({ filename: upload.filename, url });
      } catch (err) {
        errors.push({ filename: upload.filename, error: err.message });
      } finally {
        await upload.destroy();
      }
    }

    ctx.res.json({ results, errors });
  },
});
```

## Common Pitfalls

### ❌ Not Cleaning Up Files

```typescript
// Wrong: File never cleaned up
app.post("/upload", {
  schema: { files: infer.file().max(10485760) },
  controller: async (ctx) => {
    const buffer = await ctx.files.file.buffer();
    await save(buffer);
    // Disk space leaks!
  },
});

// Correct
app.post("/upload", {
  schema: { files: infer.file().max(10485760) },
  controller: async (ctx) => {
    try {
      const buffer = await ctx.files.file.buffer();
      await save(buffer);
    } finally {
      await ctx.files.file.destroy();  // Always cleanup
    }
  },
});
```

### ❌ Not Validating File Type

```typescript
// Wrong: Accepts any file
app.post("/image", {
  schema: { files: infer.file().max(10485760) },
  controller: async (ctx) => {
    await saveImage(ctx.files.file);
  },
});

// Correct
app.post("/image", {
  schema: { files: infer.file().max(10485760) },
  controller: async (ctx) => {
    if (!ctx.files.file.mimetype.startsWith("image/")) {
      await ctx.files.file.destroy();
      throw new FileFilterError();
    }
    await saveImage(ctx.files.file);
  },
});
```

### ❌ Loading Large Files into Memory

```typescript
// Wrong: 1GB file loads entirely into RAM
app.post("/video", {
  schema: { files: infer.file().max(10485760) },
  controller: async (ctx) => {
    const buffer = await ctx.files.file.buffer();  // OOM on large files!
    await processVideo(buffer);
  },
});

// Correct: Stream large files
app.post("/video", {
  schema: { files: infer.file().max(10485760) },
  controller: async (ctx) => {
    const stream = ctx.files.file.stream();
    await processVideoStream(stream);
  },
});
```

## Next Steps

- Learn about [Validation](./validation.md) for file schema
- Explore [Error Handling](./error-handling.md) for upload errors
- Implement [Middleware](./middleware.md) for file size limits
- Read [Production Best Practices](./best-practices.md)
