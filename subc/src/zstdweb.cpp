#include <emscripten.h>
#include "lubanCompress/recompress.hpp"
#include <map>

std::map<int, PDMCompressedData*> _allPDMCompressDatas;

extern "C"
{
    void* EMSCRIPTEN_KEEPALIVE emsAlloc(int32_t size) {
        return malloc(size);
    }

    void EMSCRIPTEN_KEEPALIVE emsFree(void *pointer) {
        free(pointer);
    }

    uint32_t EMSCRIPTEN_KEEPALIVE setPackageCompressFile(int packageId, uint8_t* data) {
        PDMCompressedData* pdmData = new PDMCompressedData(data);
        if (_allPDMCompressDatas.find(packageId) != _allPDMCompressDatas.end()) {
            delete _allPDMCompressDatas[packageId];
        }
        _allPDMCompressDatas.insert({ packageId, pdmData });

        if (_allPDMCompressDatas.find(packageId) != _allPDMCompressDatas.end()) {
            return packageId;
        }
        return 0;
    }

    void* EMSCRIPTEN_KEEPALIVE getFormulaById(int packageId, int id) {
        auto iter = _allPDMCompressDatas.find(packageId);
        if (iter == _allPDMCompressDatas.end()) {
            return nullptr;
        }
        return iter->second->getFormulaString(id);
    }

    void* EMSCRIPTEN_KEEPALIVE getPropsById(int packageId, int id) {
        auto iter = _allPDMCompressDatas.find(packageId);
        if (iter == _allPDMCompressDatas.end()) {
            return nullptr;
        }
        return iter->second->getPropsString(id);
    }

    void* EMSCRIPTEN_KEEPALIVE getRestrictionById(int packageId, int id) {
        auto iter = _allPDMCompressDatas.find(packageId);
        if (iter == _allPDMCompressDatas.end()) {
            return nullptr;
        }
        return iter->second->getRestrictionString(id);
    }

    void* EMSCRIPTEN_KEEPALIVE getStyleRestrictionById(int packageId, int id) {
        auto iter = _allPDMCompressDatas.find(packageId);
        if (iter == _allPDMCompressDatas.end()) {
            return nullptr;
        }
        return iter->second->getStyleRestrictionString(id);
    }

    void* EMSCRIPTEN_KEEPALIVE getGroupTypeAllByPackage(int packageId) {
        auto iter = _allPDMCompressDatas.find(packageId);
        if (iter == _allPDMCompressDatas.end()) {
            return nullptr;
        }
        return iter->second->getGroupByTypeAll();
    }

    void* EMSCRIPTEN_KEEPALIVE getTypeRestrictionByPackage(int packageId) {
        auto iter = _allPDMCompressDatas.find(packageId);
        if (iter == _allPDMCompressDatas.end()) {
            return nullptr;
        }
        return iter->second->getTypeRestrictionAll();
    }

    uint8_t* EMSCRIPTEN_KEEPALIVE compressBuffer(void *buffer, int level) {
        int srcLength = reinterpret_cast<uint32_t *>(buffer)[0];
        uint8_t* srcBuffer = reinterpret_cast<uint8_t*>(buffer) + 4;
        return NoDictTool::compressToTransferBuffer(srcBuffer, srcLength, level);
    }

    uint8_t *EMSCRIPTEN_KEEPALIVE decompressBuffer(void *buffer) {
        int srcLength = reinterpret_cast<uint32_t *>(buffer)[0];
        uint8_t* srcBuffer = reinterpret_cast<uint8_t*>(buffer) + 4;
        return NoDictTool::decompressToTransferBuffer(srcBuffer, srcLength);
    }

    uint8_t* EMSCRIPTEN_KEEPALIVE gzip(char* buffer, int level)
    {
        int srcLength = reinterpret_cast<uint32_t*>(buffer)[0];
        char* srcBuffer = reinterpret_cast<char*>(buffer) + 4;
        return NoDictTool::gzipToTransferBuffer(srcBuffer, srcLength, level);
    }

    uint8_t* EMSCRIPTEN_KEEPALIVE ungzip(char* buffer)
    {
        int srcLength = reinterpret_cast<uint32_t*>(buffer)[0];
        char* srcBuffer = reinterpret_cast<char*>(buffer) + 4;
        return NoDictTool::ungzipToTransferBuffer(srcBuffer, srcLength);
    }
}
