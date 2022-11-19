#include "lubanCompress/decompress.hpp"
#include "lubanCompress/train.hpp"
#include "lubanCompress/recompress.hpp"
#include <iostream>

int main(int argc, char** argv)
{
    if (argc < 3) {
        printf("Usage: recompress inputBin outputBin\n");
        return -1;
    }

    UnCompressBin oriFile(argv[1]);
    if (!oriFile.isValid()) {
        return -1;
    }

    oriFile.processBinBuffer();
    TrainDict train(oriFile);
    train.train();

    uint8_t *buffer = new uint8_t[1024 * 1024 * 30];
    PDMCompressBuild pdmBuild(train.getRstDict());
    pdmBuild.startToBuildData();
    pdmBuild.addFormulaItems(oriFile.getFormulaItems());
    pdmBuild.addPropsItems(oriFile.getPropsItems());
    pdmBuild.addRestrictionItems(oriFile.getRestrictionItems());
    pdmBuild.addStyleRestrictionItems(oriFile.getStyleRestrictionItems());
    pdmBuild.addGroupByTypeAll(oriFile.getGroupByTypeAll());
    pdmBuild.addTypeRestrictionAll(oriFile.getTypeRestrictionAll());
    pdmBuild.endBuild();

    auto resultBuffer = pdmBuild.getCopiedBuffer();
    PDMCompressedData pdmData(resultBuffer.data());
    if (!pdmData.isValid()) {
        printf("Usage: The compressed buffer is InValid.\n");
        return -1;
    }

    auto start = std::chrono::system_clock::now();
    auto rst = pdmData.getFormulaString(1000192);
    printf("Size of RST: %d \n", reinterpret_cast<int32_t*>(rst)[0]);
    auto rststr = std::string((char*)rst + 4, reinterpret_cast<int32_t*>(rst)[0]);
    auto end = std::chrono::system_clock::now();
    auto rst2 = pdmData.getFormulaString(1003112);
    if (!rst2) {
        printf("Cannot find the id: 1003112\n");
        return 0;
    }
    printf("Size of RST: %d \n", reinterpret_cast<int32_t*>(rst2)[0]);
    auto rst2str = std::string((char*)rst2 + 4, reinterpret_cast<int32_t*>(rst2)[0]);
    auto end2 = std::chrono::system_clock::now();
    std::chrono::duration<double> diff1 = end - start;
    std::chrono::duration<double> diff2 = end2 - end;
    std::cout << "Get -1000912 used: " << diff1.count() << ", Get 1007697 used: " << diff2.count() << std::endl;

    printf("The -1000912 is: %s\n  The 1007697 is: %s\n", rststr.c_str(), rst2str.c_str());
    pdmBuild.saveToBinary(argv[2]);

    return 1;
}
