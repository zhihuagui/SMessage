#include "lubanCompress/recompress.hpp"
#include <iostream>

int main(int argc, char** argv)
{
    if (argc < 4) {
        printf("Usage: compTest inputBin [type: formula | props | restriction | stylerestriction] id\n");
        return -1;
    }

    std::string mode = argv[2];
    if (mode == "formula" || mode == "props" || mode == "restriction" || mode == "stylerestriction" || mode == "group" || mode == "type") {
        printf("Mode is OK.\n");
    }
    else {
        printf("Usage: compTest inputBin [type: formula | props | restriction | stylerestriction | group | type] id\n");
        return -1;
    }

    auto resultBuffer = Util::readFromFile(argv[1]);
    PDMCompressedData pdmData((uint8_t*)resultBuffer.data());
    if (!pdmData.isValid()) {
        printf("Usage: The compressed buffer is InValid.\n");
        return -1;
    }

    auto id = atoi(argv[3]);

    auto start = std::chrono::system_clock::now();
    uint8_t* rst = nullptr;
    if (mode == "formula") {
        rst = pdmData.getFormulaString(id);
    }
    else if (mode == "props") {
        rst = pdmData.getPropsString(id);
    }
    else if (mode == "restriction") {
        rst = pdmData.getRestrictionString(id);
    }
    else if (mode == "stylerestriction") {
        rst = pdmData.getStyleRestrictionString(id);
    }
    else if (mode == "group") {
        rst = pdmData.getGroupByTypeAll();
    }
    else if (mode == "type") {
        rst = pdmData.getTypeRestrictionAll();
    }
    auto end = std::chrono::system_clock::now();
    if (rst == nullptr) {
        printf("Cannot find %s with id=%d\n", mode.c_str(), id);
        return 0;
    }
    printf("Size of RST: %d \n", reinterpret_cast<int32_t*>(rst)[0]);
    auto rststr = std::string((char*)rst + 4, reinterpret_cast<int32_t*>(rst)[0]);
    auto diff = std::chrono::duration_cast<std::chrono::microseconds>(end - start);
    printf("Get %s with id=%d used: %lld microseconds.\n", mode.c_str(), id, diff.count());
    //printf("\n%s\n", rststr.c_str());
    start = std::chrono::system_clock::now();
    rst = pdmData.getGroupByTypeAll();
    end = std::chrono::system_clock::now();
    diff = std::chrono::duration_cast<std::chrono::microseconds>(end - start);
    printf("Re Get %s with id=%d used: %lld microseconds.\n", mode.c_str(), id, diff.count());
    return 1;
}
