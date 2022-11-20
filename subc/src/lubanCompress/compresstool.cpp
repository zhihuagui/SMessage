#include "compresstool.hpp"
#include "zlib.h"

// 8M buffer initial
size_t TargetBuffer::mBufferSize = 1024 * 1024 * 8;
uint8_t *TargetBuffer::mSizedBuffer = (uint8_t *)malloc(1024 * 1024 * 8 + 4);
uint8_t *TargetBuffer::mBuffer = TargetBuffer::mSizedBuffer + 4;
ZSTD_CCtx *NoDictTool::mCCtx = ZSTD_createCCtx();
ZSTD_DCtx *NoDictTool::mDCtx = ZSTD_createDCtx();

uint8_t* NoDictTool::mCBuffer = new uint8_t[NoDictTool::CHUNK];

uint8_t *NoDictTool::ungzipToTransferBuffer(char *input, uint32_t length)
{
    z_stream strm;
    strm.zalloc = Z_NULL;
    strm.zfree = Z_NULL;
    strm.opaque = Z_NULL;
    strm.avail_in = length;
    strm.next_in = (Bytef *)input;
    int ret = inflateInit2(&strm, 15 | 16);
    if (ret != Z_OK)
    {
        return 0;
    }

    uint32_t have;
    uint32_t currentSize = 0;

    do
    {
        strm.avail_out = CHUNK;
        strm.next_out = mCBuffer;
        ret = inflate(&strm, Z_FINISH);
        if (ret == Z_NEED_DICT || ret == Z_DATA_ERROR || ret == Z_MEM_ERROR)
        {
            inflateEnd(&strm);
            return 0;
        }
        have = CHUNK - strm.avail_out;
        TargetBuffer::updateToSizeWithCopy(currentSize + have);
        memcpy(TargetBuffer::mBuffer + currentSize, mCBuffer, have);
        currentSize += have;
    } while (strm.avail_out == 0);
    inflateEnd(&strm);
    reinterpret_cast<int32_t *>(TargetBuffer::mSizedBuffer)[0] = static_cast<int>(currentSize);
    return TargetBuffer::mSizedBuffer;
}

uint8_t * NoDictTool::gzipToTransferBuffer(char* input, uint32_t length, int level)
{
    int ret;
    z_stream strm;
    strm.zalloc = Z_NULL;
    strm.zfree = Z_NULL;
    strm.opaque = Z_NULL;
    ret = deflateInit2(&strm, Z_DEFAULT_COMPRESSION, Z_DEFLATED, 15 | 16, 8, Z_DEFAULT_STRATEGY);
    if (ret != Z_OK)
        return 0;
    strm.avail_in = length;
    strm.next_in = (Bytef*)input;

    uint32_t have;
    uint32_t currentSize = 0;

    do {
        strm.avail_out = CHUNK;
        strm.next_out = mCBuffer;
        ret = deflate(&strm, Z_FINISH);    /* no bad return value */
        have = CHUNK - strm.avail_out;

        TargetBuffer::updateToSizeWithCopy(currentSize + have);
        memcpy(TargetBuffer::mBuffer + currentSize, mCBuffer, have);
        currentSize += have;
    } while (strm.avail_out == 0);

    (void)deflateEnd(&strm);
    reinterpret_cast<int32_t*>(TargetBuffer::mSizedBuffer)[0] = static_cast<int>(currentSize);
    return TargetBuffer::mSizedBuffer;
}
