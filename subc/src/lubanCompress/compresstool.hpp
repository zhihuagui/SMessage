#pragma once

#include <string>
#include <vector>

#define ZSTD_DISABLE_DEPRECATE_WARNINGS 1
#define ZSTD_STATIC_LINKING_ONLY 1
#define ZDICT_STATIC_LINKING_ONLY 1
#include "zstd.h"
#include "zdict.h"

struct TargetBuffer {
    static size_t mBufferSize;
    static uint8_t *mBuffer;
    static uint8_t *mSizedBuffer;

    static bool updateToSize(size_t newSize) {
        if (mBufferSize >= newSize) {
            return true;
        }
        free(mSizedBuffer);
        mSizedBuffer = (uint8_t *)malloc(newSize + 4);
        mBuffer = mSizedBuffer + 4;
        mBufferSize = newSize;
        return true;
    }

    static bool updateToSizeWithCopy(size_t newSize) {
        if (mBufferSize >= newSize) {
            return true;
        }
        mSizedBuffer = (uint8_t *)realloc(mSizedBuffer, newSize + 4);
        mBuffer = mSizedBuffer + 4;
        mBufferSize = newSize;
        return true;
    }
};

class NoDictTool {
public:
    static std::vector<uint8_t> compress(const std::vector<char> &data, int level)
    {
        auto bound = ZSTD_compressBound(data.size());
        TargetBuffer::updateToSize(bound);
        auto rstLen = ZSTD_compressCCtx(mCCtx, TargetBuffer::mBuffer, TargetBuffer::mBufferSize, data.data(), data.size(), level);
        return std::vector<uint8_t>(TargetBuffer::mBuffer, TargetBuffer::mBuffer + rstLen);
    }

    static uint8_t* compressToTransferBuffer(const std::vector<char> &data, int level)
    {
        auto bound = ZSTD_compressBound(data.size());
        TargetBuffer::updateToSize(bound);
        auto rstLen = ZSTD_compressCCtx(mCCtx, TargetBuffer::mBuffer, TargetBuffer::mBufferSize, data.data(), data.size(), level);
        reinterpret_cast<int32_t *>(TargetBuffer::mSizedBuffer)[0] = static_cast<int>(rstLen);
        return TargetBuffer::mSizedBuffer;
    }

    static uint8_t* compressToTransferBuffer(void *data, size_t size, int level)
    {
        auto bound = ZSTD_compressBound(size);
        TargetBuffer::updateToSize(bound);
        auto rstLen = ZSTD_compressCCtx(mCCtx, TargetBuffer::mBuffer, TargetBuffer::mBufferSize, data, size, level);
        reinterpret_cast<int32_t*>(TargetBuffer::mSizedBuffer)[0] = static_cast<int>(rstLen);
        return TargetBuffer::mSizedBuffer;
    }

    static std::vector<uint8_t> decompress(const uint8_t *data, size_t dataSize)
    {
        auto bound = ZSTD_decompressBound(data, dataSize);
        TargetBuffer::updateToSize(bound);
        auto rstLen = ZSTD_decompressDCtx(mDCtx, TargetBuffer::mBuffer, TargetBuffer::mBufferSize, data, dataSize);
        return std::vector<uint8_t>(TargetBuffer::mBuffer, TargetBuffer::mBuffer + rstLen);
    }

    static uint8_t *decompressToTransferBuffer(const uint8_t *data, size_t dataSize)
    {
        auto bound = ZSTD_decompressBound(data, dataSize);
        TargetBuffer::updateToSize(bound);
        auto rstLen = ZSTD_decompressDCtx(mDCtx, TargetBuffer::mBuffer, TargetBuffer::mBufferSize, data, dataSize);
        reinterpret_cast<int32_t *>(TargetBuffer::mSizedBuffer)[0] = static_cast<int>(rstLen);
        return TargetBuffer::mSizedBuffer;
    }

    static uint8_t *ungzipToTransferBuffer(char *input, uint32_t length);
    static inline std::string ungzipToString(char *input, uint32_t length) {
        auto ret = ungzipToTransferBuffer(input, length);
        return std::string((char*)ret + 4, static_cast<size_t>(reinterpret_cast<int32_t*>(ret)[0]));
    }

    static uint8_t* gzipToTransferBuffer(char* input, uint32_t length, int level);
    static inline std::vector<uint8_t> gzip(char* input, uint32_t length) {
        auto ret = gzipToTransferBuffer(input, length, 1);
        return std::vector<uint8_t>((char*)ret + 4, (char*)ret + 4 + static_cast<size_t>(reinterpret_cast<int32_t*>(ret)[0]));
    }

private:
    constexpr static size_t CHUNK = 1024 * 256;
    static uint8_t* mCBuffer;
    static ZSTD_DCtx *mDCtx;
    static ZSTD_CCtx *mCCtx;
};

class DecompressTool {
public:
    DecompressTool(const std::vector<uint8_t>& dictBuffer): mDictBuffer(dictBuffer) {
        mDDict = ZSTD_createDDict(mDictBuffer.data(), mDictBuffer.size());
        mDCtx = ZSTD_createDCtx();
    }

    std::string deCompressToString(const uint8_t *data, size_t dataSize)
    {
        auto bound = ZSTD_decompressBound(data, dataSize);
        TargetBuffer::updateToSize(bound);
        auto rstLen = ZSTD_decompress_usingDDict(mDCtx, TargetBuffer::mBuffer, TargetBuffer::mBufferSize, data, dataSize, mDDict);
        return std::string((char *)TargetBuffer::mBuffer, rstLen);
    }

    uint8_t *deCompressToTransferBuffer(const uint8_t *data, size_t dataSize) {
        auto bound = ZSTD_decompressBound(data, dataSize);
        TargetBuffer::updateToSize(bound);
        auto rstLen = ZSTD_decompress_usingDDict(mDCtx, TargetBuffer::mBuffer, TargetBuffer::mBufferSize, data, dataSize, mDDict);
        reinterpret_cast<int32_t *>(TargetBuffer::mSizedBuffer)[0] = static_cast<int>(rstLen);
        return TargetBuffer::mSizedBuffer;
    }

    auto &getDictBuffer()
    {
        return mDictBuffer;
    }

private:
    const std::vector<uint8_t> &mDictBuffer;
    ZSTD_DDict *mDDict;
    ZSTD_DCtx *mDCtx;
};

class CompressTool {
public:
    CompressTool() = delete;

    CompressTool(const std::vector<char> &dictBuffer, int compressLevel) : mDictBuffer(dictBuffer) {
        mCDict = ZSTD_createCDict(mDictBuffer.data(), mDictBuffer.size(), compressLevel);
        mCCtx = ZSTD_createCCtx();
    }

    inline std::vector<uint8_t> compressString(const std::string& str) {
        return compressData(str.data(), str.size());
    }

    inline std::vector<uint8_t> compressData(const void* buffer, size_t size) {
        auto bound = ZSTD_compressBound(size);
        TargetBuffer::updateToSize(bound);
        auto rstLen = ZSTD_compress_usingCDict(mCCtx, TargetBuffer::mBuffer, TargetBuffer::mBufferSize, buffer, size, mCDict);
        return std::vector<uint8_t>(TargetBuffer::mBuffer, TargetBuffer::mBuffer + rstLen);
    }

    inline uint8_t *compressStringToTransferBuffer(const std::string &str) {
        return compressToTransferBuffer(str.data(), str.size());
    }

    inline uint8_t* compressToTransferBuffer(const void *buffer, size_t size) {
        auto bound = ZSTD_compressBound(size);
        TargetBuffer::updateToSize(bound);
        auto rstLen = ZSTD_compress_usingCDict(mCCtx, TargetBuffer::mBuffer, TargetBuffer::mBufferSize, buffer, size, mCDict);
        reinterpret_cast<int32_t *>(TargetBuffer::mSizedBuffer)[0] = static_cast<int>(rstLen);
        return TargetBuffer::mSizedBuffer;
    }

    auto& getDictBuffer() {
        return mDictBuffer;
    }
private:
    const std::vector<char>& mDictBuffer;
    ZSTD_CDict* mCDict;
    ZSTD_CCtx* mCCtx;
};
