package com.hexmanos.engine.app.controllers;

import com.hexmanos.engine.app.dtos.AssetDTO;
import com.hexmanos.engine.core.asset.Asset;
import com.hexmanos.engine.core.asset.AssetService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/assets")
@RequiredArgsConstructor
public class AssetController {

    private final AssetService assetService;

    @GetMapping
    public ResponseEntity<List<AssetDTO>> getAllAssets() {
        List<AssetDTO> assets = assetService.getAll().stream()
                .map(AssetDTO.DTOMapper::toDTO)
                .toList();
        return ResponseEntity.ok(assets);
    }

    @GetMapping("/{id}")
    public ResponseEntity<AssetDTO> getAssetById(@PathVariable UUID id) {
        return assetService.getById(id)
                .map(AssetDTO.DTOMapper::toDTO)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @GetMapping("/status/{status}")
    public ResponseEntity<List<AssetDTO>> getAssetsByStatus(@PathVariable String status) {
        try {
            Asset.AssetStatus assetStatus = Asset.AssetStatus.valueOf(status.toUpperCase());
            List<AssetDTO> assets = assetService.getByStatus(assetStatus).stream()
                    .map(AssetDTO.DTOMapper::toDTO)
                    .toList();
            return ResponseEntity.ok(assets);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().build();
        }
    }

    @PostMapping
    public ResponseEntity<AssetDTO> createAsset(@RequestBody AssetDTO.CreateRequest request) {
        Asset asset = AssetDTO.DTOMapper.toEntity(request);
        Asset created = assetService.create(asset);
        return ResponseEntity.status(HttpStatus.CREATED).body(AssetDTO.DTOMapper.toDTO(created));
    }

    @PostMapping("/{id}/approve")
    public ResponseEntity<AssetDTO> approveAsset(@PathVariable UUID id) {
        try {
            Asset approved = assetService.approve(id);
            return ResponseEntity.ok(AssetDTO.DTOMapper.toDTO(approved));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.notFound().build();
        }
    }
}
